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
} from "../index.js";
import { AttachmentService } from "../src/core/attachment_service.js";
import { AttachmentModel } from "../src/integrations/lucid/attachment_model.js";
import { LucidAttachmentStore } from "../src/integrations/lucid/lucid_attachment_store.js";
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

  test("attaches, replaces, reads, schedules variants, and detaches a singular relation", async ({
    assert,
  }) => {
    const user = await createUser();
    const first = createDraft("first.txt");

    const original = await user.avatar.attach(first);

    assert.isTrue(first.isPersisted);
    assert.equal(original.attachableType, "relation_users");
    assert.equal(original.attachableId, user.id);
    assert.equal(original.field, "avatar");
    assert.equal(first.disk, "decorator");
    assert.equal(first.path, "avatars/user-1/first.txt");
    assert.equal((await user.avatar.get())?.id, original.id);

    await assert.rejects(
      () => user.avatar.attach(createDraft("duplicate.txt")),
      /already has an attachment/,
    );

    const replacement = createDraft("replacement.txt", {
      disk: "manager",
      folder: "imports",
    });
    const current = await user.avatar.set(replacement);
    await new LucidAttachmentStore().createVariant(current, "thumbnail", {
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
    assert.deepEqual(queued, [current.id]);

    await user.avatar.detach();

    assert.isNull(await user.avatar.get());
    assert.sameDeepMembers(removed, [
      first.path,
      replacement.path,
      "imports/thumbnail.txt",
    ]);
    assert.deepEqual(writes, [
      { disk: "decorator", path: "avatars/user-1/first.txt" },
      { disk: "manager", path: "imports/replacement.txt" },
    ]);
  });

  test("manages an ordered attachment collection from its Lucid model", async ({
    assert,
  }) => {
    const user = await createUser();
    const first = await user.gallery.add(createDraft("first.txt"));
    const second = await user.gallery.add(createDraft("second.txt"));
    const before = await user.gallery.add(createDraft("before.txt"), 0);

    assert.deepEqual(
      (await user.gallery.all()).map((item) => item.id),
      [before.id, first.id, second.id],
    );

    await user.gallery.move(second.id, 0);
    assert.deepEqual(
      (await user.gallery.all()).map((item) => item.id),
      [second.id, before.id, first.id],
    );

    assert.isTrue(await user.gallery.remove(before.id));
    assert.isFalse(await user.gallery.remove("missing-id"));

    const replacement = await user.gallery.replaceAll([
      createDraft("replacement-1.txt"),
      createDraft("replacement-2.txt"),
    ]);
    assert.deepEqual(
      replacement.map((item) => item.position),
      [0, 1],
    );

    await user.gallery.clear();
    assert.deepEqual(await user.gallery.all(), []);
    assert.equal(removed.length, 5);
  });

  test("requires the Lucid owner to be persisted", async ({ assert }) => {
    const user = new RelationUser();
    user.id = "user-1";

    await assert.rejects(
      () => user.avatar.get(),
      /require a persisted Lucid model/,
    );
  });
});
