import { setApp } from "@adonisjs/core/services/app";
import { BaseModel, column } from "@adonisjs/lucid/orm";
import { test } from "@japa/runner";
import {
  Attachment,
  AttachmentManager,
  attachment,
} from "../src/integrations/legacy/index.js";
import { AttachmentService } from "../src/core/attachment_service.js";
import {
  attachment as tableAttachment,
  AttachmentRelation,
} from "../src/integrations/lucid/index.js";
import { createLucidTestDatabase } from "./helpers/lucid_test_database.js";
import type { AttachmentJob } from "../src/core/queue.js";
import { LucidJsonAttachmentRegistry } from "../src/integrations/lucid/json/lucid_json_attachment_registry.js";
import {
  defineConfig,
  type ResolvedAttachmentConfig,
} from "../src/define_config.js";
import { MemoryAttachmentQueue } from "../src/queues/memory_queue.js";
import { AttachmentRegenerator } from "../src/integrations/lucid/regeneration/attachment_regenerator.js";

class User extends BaseModel {
  static table = "legacy_users";
  static selfAssignPrimaryKey = true;
  @column({ isPrimary: true, columnName: "user_id" }) declare id: string;
  @column() declare name: string;
  @attachment<User>({
    columnName: "image",
    folder: (user) => `users/${user.id}`,
    rename: false,
    preComputeUrl: true,
    variants: ["thumbnail"],
    meta: true,
    serializeAs: "avatar",
  })
  declare avatar: Attachment | null;
  @tableAttachment({ variants: [] }) declare document: AttachmentRelation;
}

test.group("Legacy singular JSON attachments", (group) => {
  let db: Awaited<ReturnType<typeof createLucidTestDatabase>>;
  let service: AttachmentService;
  let manager: AttachmentManager;
  const files = new Set<string>();
  const jobs: AttachmentJob[] = [];
  const raw = () => db.from("legacy_users").where("user_id", "42").first();
  const draft = (name = "avatar.jpg") =>
    manager.createFromBuffer(new Uint8Array([1]), name);
  const create = async () => {
    const row = new User();
    row.id = "42";
    row.name = "Alice";
    row.avatar = await draft();
    await row.save();
    return row;
  };
  const registry = () =>
    new LucidJsonAttachmentRegistry({
      defaultDisk: "fs",
      models: { legacy_users: async () => ({ default: User }) },
    });
  group.setup(async () => {
    db = await createLucidTestDatabase();
    User.useAdapter(db.modelAdapter());
    await db.connection().schema.createTable("legacy_users", (table) => {
      table.string("user_id").primary();
      table.string("name");
      table.text("image");
    });
  });
  group.each.setup(async () => {
    await db.from("adonis_attachment_links").delete();
    await db.from("adonis_attachments").delete();
    await db.from("legacy_users").delete();
    files.clear();
    jobs.length = 0;
    service = new AttachmentService({
      defaultDisk: "fs",
      queue: {
        async enqueue(job) {
          jobs.push(job);
        },
      },
      storage: {
        async write(file) {
          files.add(file.path);
        },
        async remove(file) {
          files.delete(file.path);
        },
        async read() {
          return new Uint8Array([1]);
        },
        async getUrl(file) {
          return `https://cdn.test/${file.path}`;
        },
        async getSignedUrl(file) {
          return `https://signed.test/${file.path}`;
        },
      },
    });
    manager = new AttachmentManager(service);
    setApp({
      container: {
        async make() {
          return service;
        },
      },
    } as never);
  });
  group.teardown(async () => {
    await db.manager.closeAll();
  });

  test("assigns a draft, writes only on save and serializes a synchronous loaded avatar", async ({
    assert,
  }) => {
    const row = new User();
    row.id = "42";
    row.name = "Alice";
    assert.isNull(row.avatar);
    row.avatar = await draft();
    row.avatar.meta = { caption: "Hello" };
    assert.isEmpty(files);
    await row.save();
    assert.instanceOf(row.avatar, Attachment);
    assert.equal(row.avatar!.path, "users/42/avatar.jpg");
    assert.deepEqual(JSON.parse((await raw()).image).meta, {
      caption: "Hello",
    });
    assert.notProperty(row.$attributes, "avatar");
    assert.equal(
      row.serialize().avatar.url,
      "https://cdn.test/users/42/avatar.jpg",
    );
    assert.deepEqual(row.serialize().avatar.meta, { caption: "Hello" });
    assert.notProperty(
      row.serialize({ fields: { omit: ["avatar"] } }),
      "avatar",
    );
    assert.equal(
      (await User.findOrFail("42")).avatar!.originalName,
      "avatar.jpg",
    );
    assert.equal((await User.all())[0]!.avatar!.url, row.avatar!.url);
    assert.equal(jobs[0]!.reference?.adapter, "json");
  });

  test("keeps stale model saves away from JSON and merges independent metadata mutations", async ({
    assert,
  }) => {
    await create();
    const a = await User.findOrFail("42");
    const b = await User.findOrFail("42");
    a.avatar!.meta = { caption: "A" };
    await a.save();
    b.name = "Bob";
    await b.save();
    assert.deepEqual(JSON.parse((await raw()).image).meta, { caption: "A" });
    b.avatar!.meta = { credit: "B" };
    await b.save();
    assert.deepEqual(b.avatar!.meta, { caption: "A", credit: "B" });
    b.avatar!.meta!.caption = "Updated";
    await b.save();
    assert.equal(JSON.parse((await raw()).image).meta.caption, "Updated");
  });

  test("rejects conflicting metadata edits and rolls back ordinary model changes", async ({
    assert,
  }) => {
    await create();
    const a = await User.findOrFail("42");
    const b = await User.findOrFail("42");
    a.avatar!.meta = { caption: "A" };
    await a.save();
    b.avatar!.meta = { caption: "B" };
    b.name = "Bob";
    await assert.rejects(() => b.save(), /metadata/i);
    assert.equal((await raw()).name, "Alice");
    assert.deepEqual(b.avatar!.meta, { caption: "B" });
  });

  test("refuses metadata changes targeting an avatar replaced by another instance", async ({
    assert,
  }) => {
    const a = await create();
    const b = await User.findOrFail("42");
    a.avatar = await draft("replacement.jpg");
    await a.save();
    b.avatar!.meta = { caption: "stale" };
    await assert.rejects(() => b.save());
    assert.equal(
      JSON.parse((await raw()).image).originalName,
      "replacement.jpg",
    );
  });

  test("restores draft and pending assignment after outer rollback, then retries safely", async ({
    assert,
  }) => {
    const row = await create();
    const before = (await raw()).image;
    const replacement = await draft("next.jpg");
    row.avatar = replacement;
    const trx = await db.transaction();
    row.useTransaction(trx);
    try {
      await row.save();
      assert.isTrue(files.has("users/42/avatar.jpg"));
      await trx.rollback();
      assert.strictEqual(row.avatar, replacement);
      assert.isFalse(replacement.draft()!.isPersisted);
      assert.equal((await raw()).image, before);
      await row.save();
      assert.isFalse(files.has("users/42/avatar.jpg"));
      assert.isTrue(files.has("users/42/next.jpg"));
    } finally {
      if (!trx.isCompleted) await trx.rollback();
    }
  });

  test("commits legacy and table attachments atomically for a new owner", async ({
    assert,
  }) => {
    const row = new User();
    row.id = "42";
    row.name = "Alice";
    const value = await draft();
    row.avatar = value;
    row.document.attachExisting("missing");
    await assert.rejects(() => row.save(), /not found/);
    assert.isNull(await raw());
    assert.isFalse(row.$isPersisted);
    assert.isEmpty(files);
    assert.strictEqual(row.avatar, value);
    assert.isFalse(value.draft()!.isPersisted);
  });

  test("hydrates old v5 variants, updates their meta and refreshes URLs without attachment tables", async ({
    assert,
  }) => {
    const row = await create();
    const document = JSON.parse((await raw()).image);
    delete document.id;
    delete document.disk;
    document.variants = [
      {
        key: "thumbnail",
        name: "thumb.jpg",
        path: "thumb.jpg",
        size: 1,
        extname: "jpg",
        mimeType: "image/jpeg",
        meta: { width: 10 },
      },
    ];
    await db
      .from("legacy_users")
      .where("user_id", "42")
      .update({ image: JSON.stringify(document) });
    await row.refresh();
    assert.equal(row.avatar!.getVariant("thumbnail")!.meta!.width, 10);
    assert.equal(
      await row.avatar!.getUrl("thumbnail"),
      "https://cdn.test/thumb.jpg",
    );
    assert.equal(
      await row.avatar!.getSignedUrl("thumbnail"),
      "https://signed.test/thumb.jpg",
    );
    assert.equal(
      row.serialize().avatar.thumbnail.url,
      "https://cdn.test/thumb.jpg",
    );
    row.avatar!.getVariant("thumbnail")!.meta!.caption = "Small";
    await row.save();
    assert.equal(
      JSON.parse((await raw()).image).variants[0].meta.caption,
      "Small",
    );
    assert.isEmpty(await db.from("adonis_attachments"));
    const reference = row.avatar!.file().reference!;
    assert.equal(
      (await registry().findByReference(reference))!.id,
      row.avatar!.id,
    );
  });

  test("keeps metadata edits pending on rollback", async ({ assert }) => {
    const row = await create();
    const before = (await raw()).image;
    row.avatar!.meta = { caption: "Changed" };
    const trx = await db.transaction();
    row.useTransaction(trx);
    try {
      await row.save();
      await trx.rollback();
      assert.deepEqual(row.avatar!.meta, { caption: "Changed" });
      assert.equal((await raw()).image, before);
      await row.save();
      assert.equal(JSON.parse((await raw()).image).meta.caption, "Changed");
    } finally {
      if (!trx.isCompleted) await trx.rollback();
    }
  });

  test("null assignment and owner deletion remove files after commit only", async ({
    assert,
  }) => {
    const row = await create();
    const trx = await db.transaction();
    row.useTransaction(trx);
    row.avatar = null;
    try {
      await row.save();
      assert.isNotEmpty(files);
      await trx.rollback();
      assert.isNull(row.avatar);
      assert.isNotNull((await raw()).image);
      await row.save();
      assert.isNull((await raw()).image);
      assert.isEmpty(files);
      row.avatar = await draft();
      await row.save();
      await row.delete();
      assert.isNull(await raw());
      assert.isEmpty(files);
    } finally {
      if (!trx.isCompleted) await trx.rollback();
    }
  });

  test("does not treat an omitted JSON column as null or share an existing file", async ({
    assert,
  }) => {
    const original = await create();
    const partial = await User.query().select("user_id", "name").firstOrFail();
    assert.throws(() => partial.avatar, /not selected/);
    partial.name = "Bob";
    await partial.save();
    assert.equal(JSON.parse((await raw()).image).originalName, "avatar.jpg");
    const another = new User();
    assert.throws(() => {
      another.avatar = original.avatar;
    }, /cannot be shared/);
    original.avatar!.meta = { caption: "pending" };
    await assert.rejects(() => original.refresh(), /pending/);
  });

  test("processes original and variant metadata with the default memory queue", async ({
    assert,
  }) => {
    let resolved: ResolvedAttachmentConfig;
    const application = {
      container: {
        hasBinding: (name: string) => name === "lucid.db",
        async make(name: string) {
          if (name === "jrmc.attachment") return service;
          if (name === "jrmc.attachment.json") return resolved.jsonPersistence;
          if (name === "jrmc.attachment.repository") return resolved.repository;
          if (name === "jrmc.attachment.converters") return resolved.converters;
          throw new Error(`Unexpected binding ${name}`);
        },
      },
    };
    resolved = await defineConfig({
      defaultDisk: "fs",
      route: false,
      integrations: {
        lucid: {
          jsonModels: { legacy_users: async () => ({ default: User }) },
        },
      },
      media: {
        metadata: [
          {
            async extract() {
              return { inspected: true };
            },
          },
        ],
        metadataPolicy: { mode: "deferred" },
      },
      converters: {
        thumbnail: {
          converter: async () => ({
            default: {
              key: "thumbnail",
              async convert() {
                return {
                  body: new Uint8Array([2]),
                  fileName: "thumb.jpg",
                  mimeType: "image/jpeg",
                };
              },
            },
          }),
        },
      },
      storage: {
        async write(file) {
          files.add(file.path);
        },
        async read() {
          return new Uint8Array([1]);
        },
        async remove(file) {
          files.delete(file.path);
        },
      },
    }).resolver(application as never);
    service = new AttachmentService(resolved);
    manager = new AttachmentManager(service);
    setApp(application as never);
    const row = await create();
    await (resolved.queue as MemoryAttachmentQueue).drain();
    await row.refresh();
    assert.deepEqual(row.avatar!.meta, { inspected: true });
    assert.deepEqual(row.avatar!.getVariant("thumbnail")!.meta, {
      inspected: true,
    });
    row.avatar!.getVariant("thumbnail")!.meta!.caption = "Small";
    await row.save();
    assert.equal(
      JSON.parse((await raw()).image).variants[0].meta.caption,
      "Small",
    );
    const previous = row.avatar!.getVariant("thumbnail")!.id;
    const regenerated = await new AttachmentRegenerator()
      .row(row, { attributes: ["avatar"], variants: ["thumbnail"] })
      .run();
    assert.deepEqual(regenerated, { rows: 1, attachments: 1 });
    await (resolved.queue as MemoryAttachmentQueue).drain();
    await row.refresh();
    assert.notEqual(row.avatar!.getVariant("thumbnail")!.id, previous);
  });

  test("supports serialized aliases and hides fields with serializeAs null", async ({
    assert,
  }) => {
    class Aliased extends BaseModel {
      static table = "legacy_users";
      @column({ isPrimary: true, columnName: "user_id" }) declare id: string;
      @attachment({ columnName: "image", serializeAs: "picture" })
      declare avatar: Attachment | null;
    }
    class Hidden extends BaseModel {
      static table = "legacy_users";
      @column({ isPrimary: true, columnName: "user_id" }) declare id: string;
      @attachment({ columnName: "image", serializeAs: null })
      declare avatar: Attachment | null;
    }
    class Customized extends BaseModel {
      static table = "legacy_users";
      @column({ isPrimary: true, columnName: "user_id" }) declare id: string;
      @attachment({
        columnName: "image",
        serialize: (value) => value?.originalName ?? null,
      })
      declare avatar: Attachment | null;
    }
    Aliased.useAdapter(db.modelAdapter());
    Hidden.useAdapter(db.modelAdapter());
    Customized.useAdapter(db.modelAdapter());
    await create();
    const aliased = await Aliased.findOrFail("42");
    assert.equal(aliased.serialize().picture.originalName, "avatar.jpg");
    assert.notProperty(aliased.serialize(), "avatar");
    assert.notProperty((await Hidden.findOrFail("42")).serialize(), "avatar");
    assert.equal(
      (await Customized.findOrFail("42")).serialize().avatar,
      "avatar.jpg",
    );
    const paginated = await User.query().paginate(1, 10);
    assert.equal(paginated.all()[0]!.avatar!.originalName, "avatar.jpg");
  });

  test("persists assignments made in a beforeSave hook inside the owner transaction", async ({
    assert,
  }) => {
    class Hooked extends BaseModel {
      static table = "legacy_users";
      static selfAssignPrimaryKey = true;
      @column({ isPrimary: true, columnName: "user_id" }) declare id: string;
      @attachment({ columnName: "image", variants: [] })
      declare avatar: Attachment | null;
    }
    Hooked.useAdapter(db.modelAdapter());
    Hooked.before("save", async (row) => {
      if (!row.$isPersisted) row.avatar = await draft();
    });
    const row = new Hooked();
    row.id = "42";
    await row.save();
    assert.equal(row.avatar!.originalName, "avatar.jpg");
    assert.equal(JSON.parse((await raw()).image).originalName, "avatar.jpg");
  });

  test("serializes an empty new owner after save and prevents sharing an unpersisted draft", async ({
    assert,
  }) => {
    const row = new User();
    row.id = "42";
    row.name = "Alice";
    await row.save();
    assert.isNull(row.avatar);
    assert.isNull(row.serialize().avatar);
    const value = await draft();
    row.avatar = value;
    const other = new User();
    other.id = "43";
    other.name = "Bob";
    assert.throws(() => {
      other.avatar = value;
    }, /multiple owner fields/);
    await row.save();
    assert.equal(files.size, 1);
  });

  test("reads serialized JSON null as empty and never caches an invalid refresh", async ({
    assert,
  }) => {
    const row = await create();
    await db
      .from("legacy_users")
      .where("user_id", "42")
      .update({ image: "null" });
    await row.refresh();
    assert.isNull(row.avatar);
    assert.isNull(row.serialize().avatar);
    await db
      .from("legacy_users")
      .where("user_id", "42")
      .update({ image: "{}" });
    await assert.rejects(() => row.refresh());
    await assert.rejects(() => User.findOrFail("42"));
  });
});
