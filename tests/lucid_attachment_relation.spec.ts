/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { setApp } from "@adonisjs/core/services/app";
import type { Database } from "@adonisjs/lucid/database";
import { BaseModel, column } from "@adonisjs/lucid/orm";
import { test } from "@japa/runner";

import {
  attachmentRelation,
  attachmentsRelation,
  type AttachmentCollectionRelation,
  type AttachmentRelation,
} from "../src/integrations/lucid/index.js";
import { AttachmentService } from "../src/core/attachment_service.js";
import type { AttachmentJob } from "../src/core/queue.js";
import { AttachmentModel } from "../src/integrations/lucid/models/attachment_model.js";
import { LucidAttachmentStore } from "../src/integrations/lucid/persistence/lucid_attachment_store.js";
import { createLucidTestDatabase } from "./helpers/lucid_test_database.js";

class RelationUser extends BaseModel {
  static table = "relation_users";
  static selfAssignPrimaryKey = true;

  @column({ isPrimary: true })
  declare id: string;

  @column()
  declare name: string;

  @attachmentRelation({
    disk: "decorator",
    folder: ({ model }) => `avatars/${(model as RelationUser).id}`,
    rename: false,
    preComputeUrl: true,
  })
  declare avatar: AttachmentRelation;

  @attachmentsRelation({
    folder: ({ model }) => `gallery/${(model as RelationUser).id}`,
    rename: false,
  })
  declare gallery: AttachmentCollectionRelation;
}

let database: Database;
let attachments: AttachmentService;
let removed: string[];
let writes: Array<{ disk: string; path: string }>;
let queued: string[];
let nextId = 0;

function createDraft(
  name: string,
  options: Parameters<AttachmentService["createDraft"]>[1] = {},
) {
  return attachments.createDraft(
    {
      body: Buffer.from(name),
      originalName: name,
      mimeType: "text/plain",
    },
    options,
  );
}

async function createUser(id = "user-1"): Promise<RelationUser> {
  const user = new RelationUser();
  user.id = id;
  user.name = id;
  await user.save();
  return user;
}

async function getAvatarOrFail(user: RelationUser) {
  const avatar = await user.avatar.get();

  if (!avatar) {
    throw new Error("Expected a persisted avatar link");
  }

  return avatar;
}

test.group("Lucid attachment relations", (group) => {
  group.setup(async () => {
    database = await createLucidTestDatabase();
    RelationUser.useAdapter(database.modelAdapter());
    await database
      .connection()
      .schema.createTable("relation_users", (table) => {
        table.string("id").primary();
        table.string("name").notNullable().unique();
      });
  });

  group.each.setup(async () => {
    await database.from("attachments").delete();
    await database.from("relation_users").delete();
    removed = [];
    writes = [];
    queued = [];
    nextId = 0;
    attachments = new AttachmentService({
      defaultDisk: "fs",
      defaults: { disk: "config", folder: "config" },
      createId: () => `attachment-${++nextId}`,
      queue: {
        async enqueue(job) {
          queued.push(job.attachmentId);
        },
      },
      storage: {
        async write(input) {
          writes.push({ disk: input.disk, path: input.path });
        },
        async read() {
          return new Uint8Array();
        },
        async remove(location) {
          removed.push(location.path);
        },
        async getUrl(location) {
          return `https://cdn.example.test/${location.path}`;
        },
      },
    });
    setApp({
      container: {
        async make(binding: string) {
          if (binding !== "jrmc.attachment") {
            throw new Error(`Unexpected binding: ${binding}`);
          }

          return attachments;
        },
      },
    } as never);
  });

  group.teardown(async () => {
    await database.manager.closeAll();
  });

  test("stages singular changes until the Lucid model is saved", async ({
    assert,
  }) => {
    const user = new RelationUser();
    user.id = "user-1";
    user.name = "user-1";
    const first = createDraft("first.txt");

    user.avatar.attach(first);
    assert.isFalse(first.isPersisted);
    await user.save();
    const original = await getAvatarOrFail(user);

    assert.isTrue(first.isPersisted);
    assert.equal(original.attachableType, "relation_users");
    assert.equal(original.attachableId, user.id);
    assert.equal(original.field, "avatar");
    assert.equal(first.disk, "decorator");
    assert.equal(first.path, "avatars/user-1/first.txt");
    assert.equal((await user.avatar.get())?.id, original.id);
    assert.equal((await user.avatar.get())?.attachment.url, "https://cdn.example.test/avatars/user-1/first.txt");

    user.avatar.attach(createDraft("duplicate.txt"));
    await assert.rejects(
      () => user.save(),
      /already has an attachment/,
    );

    const replacement = createDraft("replacement.txt", {
      disk: "manager",
      folder: "imports",
    });
    user.avatar.set(replacement);
    await user.save();
    const current = await getAvatarOrFail(user);
    await new LucidAttachmentStore().createVariant(current.attachment, "thumbnail", {
      id: "variant-id",
      disk: "manager",
      path: "imports/thumbnail.txt",
      name: "thumbnail.txt",
      originalName: "replacement.txt",
      mimeType: "text/plain",
      extname: "txt",
      size: 1,
    });

    assert.equal(replacement.path, "imports/replacement.txt");
    assert.deepEqual(
      (await user.avatar.variants()).map((variant) => variant.id),
      ["variant-id"],
    );
    assert.isTrue(await user.avatar.regenerateVariants(["thumbnail"]));
    assert.deepEqual(queued, [current.attachmentId]);

    user.avatar.detach();
    await user.save();

    assert.isNull(await user.avatar.get());
    assert.sameDeepMembers(removed, [
      first.toAttachment().path,
      replacement.toAttachment().path,
      "imports/thumbnail.txt",
    ]);
    assert.deepEqual(writes, [
      { disk: "decorator", path: "avatars/user-1/first.txt" },
      { disk: "manager", path: "imports/replacement.txt" },
    ]);
  });

  test("stages ordered collection changes until the Lucid model is saved", async ({
    assert,
  }) => {
    const user = await createUser();
    user.gallery.add(createDraft("existing.txt"));
    user.gallery.addMany([createDraft("first.txt"), createDraft("second.txt")], 0);
    await user.save();
    const [first, second, existing] = await user.gallery.all();

    if (!first || !second || !existing) {
      throw new Error("Expected persisted gallery links");
    }

    assert.deepEqual(
      (await user.gallery.all()).map((item) => item.id),
      [first.id, second.id, existing.id],
    );

    user.gallery.move(existing.id, 0);
    await user.save();
    assert.deepEqual(
      (await user.gallery.all()).map((item) => item.id),
      [existing.id, first.id, second.id],
    );

    user.gallery.remove(first.id);
    user.gallery.remove("missing-id");
    await user.save();

    user.gallery.replaceAll([
      createDraft("replacement-1.txt"),
      createDraft("replacement-2.txt"),
    ]);
    await user.save();
    const replacement = await user.gallery.all();
    assert.deepEqual(
      replacement.map((item) => item.position),
      [0, 1],
    );

    user.gallery.clear();
    await user.save();
    assert.deepEqual(await user.gallery.all(), []);
    assert.equal(removed.length, 5);
  });

  test("can flush a staged relation explicitly for a persisted owner", async ({ assert }) => {
    const user = await createUser();
    const draft = createDraft("immediate.txt");

    user.avatar.set(draft);
    const avatar = await user.avatar.persist();

    assert.isNotNull(avatar);
    assert.isTrue(draft.isPersisted);
    assert.equal((await user.avatar.get())?.id, avatar?.id);
  });

  test("keeps a staged relation available when the model save fails", async ({ assert }) => {
    await createUser("existing-user");
    const user = new RelationUser();
    user.id = "retry-user";
    user.name = "existing-user";
    const draft = createDraft("retry.txt");

    user.avatar.set(draft);
    await assert.rejects(() => user.save());

    assert.isFalse(draft.isPersisted);
    assert.deepEqual(writes, []);

    user.name = "retry-user";
    await user.save();

    assert.isTrue(draft.isPersisted);
    assert.equal((await getAvatarOrFail(user)).attachmentId, draft.id);
  });

  test("requires the Lucid owner to be persisted", async ({ assert }) => {
    const user = new RelationUser();
    user.id = "user-1";

    await assert.rejects(
      () => user.avatar.get(),
      /require a persisted Lucid model/,
    );
  });

  test("uses the owner transaction and cleans up a new file after rollback", async ({
    assert,
  }) => {
    const user = await createUser();
    const draft = createDraft("rollback.txt");

    await assert.rejects(
      () =>
        database.transaction(async (trx) => {
          const transactionalUser = await RelationUser.query({ client: trx })
            .where("id", user.id)
            .firstOrFail();
          transactionalUser.useTransaction(trx);

          transactionalUser.avatar.attach(draft);
          await transactionalUser.save();
          assert.isNotNull(await transactionalUser.avatar.get());

          throw new Error("Rollback requested");
        }),
      /Rollback requested/,
    );

    assert.isNull(await user.avatar.get());
    assert.deepEqual(removed, [draft.path]);
  });

  test("schedules configured variants only after a relation transaction commits", async ({
    assert,
  }) => {
    const scheduled: AttachmentJob[] = [];
    attachments = new AttachmentService({
      defaultDisk: "fs",
      defaults: { variants: ["config"] },
      createId: () => `attachment-${++nextId}`,
      queue: {
        async enqueue(job) {
          scheduled.push(job);
        },
      },
      storage: {
        async write(input) {
          writes.push({ disk: input.disk, path: input.path });
        },
        async read() {
          return new Uint8Array();
        },
        async remove(location) {
          removed.push(location.path);
        },
      },
    });
    const user = await createUser();
    const draft = createDraft("automatic.txt", { variants: ["manager"] });

    await database.transaction(async (trx) => {
      const transactionalUser = await RelationUser.query({ client: trx })
        .where("id", user.id)
        .firstOrFail();
      transactionalUser.useTransaction(trx);
      transactionalUser.avatar.attach(draft);
      await transactionalUser.save();

      assert.deepEqual(scheduled, []);
    });

    assert.deepEqual(scheduled, [
      {
        type: "generate-variants",
        attachmentId: draft.id,
        variantKeys: ["manager"],
        eventContext: {
          tableName: "relation_users",
          attributeName: "avatar",
          primary: { key: "id", value: user.id },
        },
      },
    ]);
  });

  test("defers file deletion until an owner transaction commits", async ({ assert }) => {
    const user = await createUser();
    const draft = createDraft("avatar.txt");
    user.avatar.attach(draft);
    await user.save();
    removed = [];

    await assert.rejects(
      () =>
        database.transaction(async (trx) => {
          const transactionalUser = await RelationUser.query({ client: trx })
            .where("id", user.id)
            .firstOrFail();
          transactionalUser.useTransaction(trx);

          transactionalUser.avatar.detach();
          await transactionalUser.save();
          assert.isNull(await transactionalUser.avatar.get());

          throw new Error("Rollback requested");
        }),
      /Rollback requested/,
    );

    assert.equal((await user.avatar.get())?.attachmentId, draft.id);
    assert.deepEqual(removed, []);
  });

  test("purges relation links and unreferenced blobs when the owner is deleted", async ({
    assert,
  }) => {
    const user = await createUser();
    user.avatar.attach(createDraft("avatar.txt"));
    user.gallery.add(createDraft("gallery.txt"));
    await user.save();
    const avatar = await getAvatarOrFail(user);
    const [gallery] = await user.gallery.all();

    if (!gallery) {
      throw new Error("Expected a persisted gallery link");
    }
    removed = [];

    await user.delete();

    assert.isNull(await user.avatar.get());
    assert.deepEqual(await user.gallery.all(), []);
    assert.isNull(await AttachmentModel.find(avatar.attachmentId));
    assert.isNull(await AttachmentModel.find(gallery.attachmentId));
    assert.sameDeepMembers(removed, [
      avatar.toAttachment().path,
      gallery.toAttachment().path,
    ]);
  });

  test("keeps a shared blob until its last owner link is deleted", async ({ assert }) => {
    const firstUser = await createUser("user-1");
    const secondUser = await createUser("user-2");
    firstUser.avatar.attach(createDraft("shared.txt"));
    await firstUser.save();
    const firstLink = await getAvatarOrFail(firstUser);
    secondUser.avatar.attachExisting(firstLink.attachmentId);
    await secondUser.save();
    const secondLink = await getAvatarOrFail(secondUser);
    removed = [];

    assert.notEqual(firstLink.id, secondLink.id);
    assert.equal(firstLink.attachmentId, secondLink.attachmentId);

    await firstUser.delete();

    assert.isNotNull(await AttachmentModel.find(firstLink.attachmentId));
    assert.deepEqual(removed, []);

    await secondUser.delete();

    assert.isNull(await AttachmentModel.find(firstLink.attachmentId));
    assert.deepEqual(removed, [firstLink.toAttachment().path]);
  });
});
