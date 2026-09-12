import { setApp } from "@adonisjs/core/services/app";
import { BaseModel, column } from "@adonisjs/lucid/orm";
import { test } from "@japa/runner";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Attachment,
  AttachmentManager,
  attachment,
  attachments,
  attachmentManager,
} from "@jrmc/adonis-attachment/legacy";
import { AttachmentManager as SourceManager } from "../src/sources/attachment_manager.js";
import { AttachmentService } from "../src/core/attachment_service.js";
import type { AttachmentJob } from "../src/core/queue.js";
import { createLucidTestDatabase } from "./helpers/lucid_test_database.js";
import {
  defineConfig,
  type ResolvedAttachmentConfig,
} from "../src/define_config.js";
import { MemoryAttachmentQueue } from "../src/queues/memory_queue.js";
import { AttachmentRegenerator } from "../src/integrations/lucid/regeneration/attachment_regenerator.js";
import { createLucidAttachmentProcessor } from "../src/integrations/lucid/create_lucid_attachment_processor.js";

class User extends BaseModel {
  static table = "legacy_collection_users";
  static selfAssignPrimaryKey = true;
  @column({ isPrimary: true }) declare id: string;
  @column() declare name: string;
  @attachments<User>({
    columnName: "images",
    folder: (user) => `users/${user.id}`,
    rename: false,
    meta: true,
    variants: ["thumbnail"],
    preComputeUrl: true,
  })
  declare gallery: Attachment[] | null;
  @attachment({ variants: [] }) declare avatar: Attachment | null;
}

test.group("Legacy JSON collections", (group) => {
  let db: Awaited<ReturnType<typeof createLucidTestDatabase>>;
  let service: AttachmentService;
  let manager: AttachmentManager;
  const files = new Map<string, Uint8Array>();
  const jobs: AttachmentJob[] = [];
  const storage = {
    async write(file: { path: string; body: Uint8Array }) {
      files.set(file.path, file.body);
    },
    async remove(file: { path: string }) {
      files.delete(file.path);
    },
    async read(file: { path: string }) {
      return files.get(file.path) ?? new Uint8Array([1]);
    },
    async getUrl(file: { path: string }) {
      return `https://cdn.test/${file.path}`;
    },
  };
  const raw = () => db.from(User.table).where("id", "42").first();
  const draft = (name = "image.jpg") =>
    manager.createFromBuffer(new Uint8Array([1]), name);
  const create = async () => {
    const row = new User();
    row.id = "42";
    row.name = "Alice";
    row.gallery = [await draft("a.jpg"), await draft("b.jpg")];
    await row.save();
    return row;
  };
  group.setup(async () => {
    db = await createLucidTestDatabase({ createSchema: false });
    User.useAdapter(db.modelAdapter());
    await db.connection().schema.createTable(User.table, (table) => {
      table.string("id").primary();
      table.string("name");
      table.text("images");
      table.text("avatar");
    });
  });
  group.each.setup(async () => {
    await db.from(User.table).delete();
    files.clear();
    jobs.length = 0;
    service = new AttachmentService({
      defaultDisk: "fs",
      storage,
      queue: {
        async enqueue(job) {
          jobs.push(job);
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
  group.teardown(() => db.manager.closeAll());

  test("creates assignable drafts from multiple multipart files through the public manager", async ({
    assert,
  }) => {
    const directory = await mkdtemp(
      join(tmpdir(), "attachment-legacy-collection-"),
    );
    try {
      const path = join(directory, "upload");
      await writeFile(path, new Uint8Array([1, 2]));
      setApp({
        container: {
          async make(name: string) {
            return name === "jrmc.attachment.manager"
              ? new SourceManager(service)
              : service;
          },
        },
      } as never);
      const values = await attachmentManager.createFromFiles(
        ["a.png", "b.png"].map((clientName) => ({
          tmpPath: path,
          clientName,
          type: "image",
          subtype: "png",
        })),
        { variants: [] },
      );
      assert.lengthOf(values, 2);
      assert.isEmpty(files);
      assert.isTrue(
        values.every(
          (item) => item instanceof Attachment && !item.draft()!.isPersisted,
        ),
      );
      const row = new User();
      row.id = "42";
      row.gallery = values;
      await row.save();
      assert.deepEqual(
        row.gallery!.map((item) => item.originalName),
        ["a.png", "b.png"],
      );
      assert.isEmpty(jobs);
      assert.deepEqual(await attachmentManager.createFromFiles([]), []);
      await assert.rejects(
        () =>
          attachmentManager.createFromFiles([{ clientName: "invalid.jpg" }]),
        /temporary path/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rolls back an entire new owner and multiple fields when a later file write fails", async ({
    assert,
  }) => {
    let writes = 0;
    service = new AttachmentService({
      defaultDisk: "fs",
      storage: {
        ...storage,
        async write(file) {
          if (++writes === 3) throw new Error("storage unavailable");
          await storage.write(file);
        },
      },
      queue: {
        async enqueue(job) {
          jobs.push(job);
        },
      },
    });
    manager = new AttachmentManager(service);
    const row = new User();
    row.id = "42";
    row.name = "Alice";
    row.gallery = [await draft("a.jpg"), await draft("b.jpg")];
    const pending = row.gallery;
    const avatar = await draft("avatar.jpg");
    row.avatar = avatar;
    await assert.rejects(() => row.save(), /storage unavailable/);
    assert.isFalse(row.$isPersisted);
    assert.isNull(await raw());
    assert.isEmpty(files);
    assert.isEmpty(jobs);
    assert.strictEqual(row.gallery, pending);
    assert.isTrue(row.gallery!.every((item) => !item.draft()!.isPersisted));
    await row.save();
    assert.equal(files.size, 3);
  });

  test("assigns, appends and filters ordinary arrays, saving only on owner save", async ({
    assert,
  }) => {
    const row = new User();
    row.id = "42";
    row.name = "Alice";
    const first = await draft("a.jpg");
    row.gallery = [first];
    assert.isEmpty(files);
    await row.save();
    assert.equal(row.gallery![0]!.path, "users/42/a.jpg");
    const kept = row.gallery![0]!;
    row.gallery!.push(await draft("b.jpg"));
    assert.equal(files.size, 1);
    await row.save();
    assert.deepEqual(
      row.gallery!.map((item) => item.originalName),
      ["a.jpg", "b.jpg"],
    );
    row.gallery = row.gallery!.filter((item) => item.id !== kept.id);
    await row.save();
    assert.deepEqual(
      row.gallery!.map((item) => item.originalName),
      ["b.jpg"],
    );
    assert.isFalse(files.has("users/42/a.jpg"));
    assert.equal(
      row.serialize().gallery[0].url,
      "https://cdn.test/users/42/b.jpg",
    );
    assert.notProperty(row.$attributes, "gallery");
    assert.notProperty(
      row.serialize({ fields: { omit: ["gallery"] } }),
      "gallery",
    );
    assert.lengthOf(jobs, 2);
    assert.equal(jobs[0]!.reference!.owner!.field, "gallery");
    row.gallery!.splice(0, 1);
    await row.save();
    assert.deepEqual(JSON.parse((await raw()).images), []);
    assert.isEmpty(files);
  });

  test("merges independent additions and removals without resurrecting stale items", async ({
    assert,
  }) => {
    await create();
    const a = await User.findOrFail("42");
    const b = await User.findOrFail("42");
    a.gallery!.splice(0, 1);
    a.gallery!.push(await draft("c.jpg"));
    await a.save();
    b.gallery!.push(await draft("d.jpg"));
    await b.save();
    assert.deepEqual(
      b.gallery!.map((item) => item.originalName),
      ["b.jpg", "c.jpg", "d.jpg"],
    );
    assert.isFalse(files.has("users/42/a.jpg"));
    // An array edit removes only loaded items; a concurrent addition survives.
    const stale = await User.findOrFail("42");
    b.gallery!.push(await draft("e.jpg"));
    await b.save();
    stale.gallery = [];
    await stale.save();
    assert.deepEqual(
      stale.gallery!.map((item) => item.originalName),
      ["e.jpg"],
    );
    stale.gallery = null; // Explicitly clear the current field, including unseen items.
    await stale.save();
    assert.isEmpty(stale.gallery!);
    assert.isEmpty(files);
  });

  test("keeps stale ordinary saves away from JSON and merges original and variant metadata", async ({
    assert,
  }) => {
    await create();
    const document = JSON.parse((await raw()).images);
    document[0].variants = [
      {
        key: "thumbnail",
        name: "thumb.jpg",
        path: "thumb.jpg",
        size: 1,
        extname: "jpg",
        mimeType: "image/jpeg",
        meta: { width: 10 },
        blurhash: "old-hash",
      },
    ];
    delete document[0].id;
    await db
      .from(User.table)
      .where("id", "42")
      .update({ images: JSON.stringify(document) });
    const a = await User.findOrFail("42");
    const b = await User.findOrFail("42");
    assert.equal(a.gallery![0]!.getVariant("thumbnail")!.blurhash, "old-hash");
    assert.equal(a.serialize().gallery[0].thumbnail.blurhash, "old-hash");
    a.gallery![0]!.meta = { caption: "A" };
    a.gallery![0]!.getVariant("thumbnail")!.meta!.caption = "Small";
    await a.save();
    b.name = "Bob";
    await b.save();
    assert.equal(JSON.parse((await raw()).images)[0].meta.caption, "A");
    b.gallery![0]!.meta = { credit: "B" };
    b.gallery![1]!.meta = { caption: "Second" };
    await b.save();
    assert.deepEqual(b.gallery![0]!.meta, { caption: "A", credit: "B" });
    assert.equal(
      b.gallery![0]!.getVariant("thumbnail")!.meta!.caption,
      "Small",
    );
    assert.equal(b.gallery![0]!.getVariant("thumbnail")!.blurhash, "old-hash");
  });

  test("rolls back membership, files and ordinary attributes on a metadata conflict", async ({
    assert,
  }) => {
    await create();
    const a = await User.findOrFail("42");
    const b = await User.findOrFail("42");
    a.gallery![0]!.meta = { caption: "A" };
    await a.save();
    const next = await draft("c.jpg");
    b.gallery![0]!.meta = { caption: "B" };
    b.gallery!.splice(1, 1);
    b.gallery!.push(next);
    b.name = "Bob";
    await assert.rejects(() => b.save(), /metadata/i);
    assert.equal((await raw()).name, "Alice");
    assert.equal(files.size, 2);
    assert.isTrue(files.has("users/42/b.jpg"));
    assert.isFalse(next.draft()!.isPersisted);
    assert.equal(b.gallery![0]!.meta!.caption, "B");
    assert.strictEqual(b.gallery![1], next);
  });

  test("rejects metadata edits to a concurrently removed collection item", async ({
    assert,
  }) => {
    await create();
    const a = await User.findOrFail("42");
    const b = await User.findOrFail("42");
    a.gallery!.splice(0, 1);
    await a.save();
    b.gallery![0]!.meta = { caption: "stale" };
    await assert.rejects(() => b.save(), /not found/i);
    assert.lengthOf(JSON.parse((await raw()).images), 1);
  });

  test("restores pending array edits and drafts after outer rollback with same-name protection", async ({
    assert,
  }) => {
    const row = await create();
    const before = (await raw()).images;
    const oldPath = row.gallery![0]!.path;
    const next = await draft("a.jpg");
    row.gallery = [row.gallery![1]!, next];
    const pending = row.gallery;
    const trx = await db.transaction();
    row.useTransaction(trx);
    try {
      await row.save();
      assert.isTrue(files.has(oldPath));
      assert.notEqual(row.gallery![1]!.path, oldPath);
      await trx.rollback();
      assert.equal((await raw()).images, before);
      assert.strictEqual(row.gallery, pending);
      assert.isFalse(next.draft()!.isPersisted);
      assert.equal(files.size, 2);
      await row.save();
      assert.isFalse(files.has(oldPath));
      assert.equal(files.size, 2);
    } finally {
      if (!trx.isCompleted) await trx.rollback();
    }
  });

  test("rejects duplicates, foreign attachments, sparse arrays and reordering", async ({
    assert,
  }) => {
    const row = await create();
    const another = new User();
    assert.throws(() => {
      another.gallery = [row.gallery![0]!];
    }, /cannot be shared/i);
    assert.throws(() => {
      row.gallery = [row.gallery![0]!, row.gallery![0]!];
    }, /duplicate/);
    const pending = await draft();
    row.avatar = pending;
    assert.throws(() => {
      row.gallery = [...row.gallery!, pending];
    }, /multiple owner fields/);
    row.gallery!.reverse();
    await assert.rejects(() => row.save(), /reordering/);
    row.gallery!.reverse();
    delete row.gallery![0];
    await assert.rejects(() => row.save(), /sparse/);
    assert.equal(files.size, 2);
  });

  test("protects partial selects and pending in-place edits from refresh", async ({
    assert,
  }) => {
    await create();
    const partial = await User.query().select("id", "name").firstOrFail();
    assert.throws(() => partial.gallery, /not selected/);
    partial.name = "Bob";
    await partial.save();
    assert.lengthOf(JSON.parse((await raw()).images), 2);
    const row = await User.findOrFail("42");
    row.gallery!.pop();
    await assert.rejects(() => row.refresh(), /pending/);
  });

  test("purges originals and variants only after owner deletion commits", async ({
    assert,
  }) => {
    const row = await create();
    const document = JSON.parse((await raw()).images);
    document[0].variants = [
      {
        key: "thumbnail",
        name: "thumb.jpg",
        size: 1,
        extname: "jpg",
        mimeType: "image/jpeg",
      },
    ];
    files.set("thumb.jpg", new Uint8Array([2]));
    await db
      .from(User.table)
      .where("id", "42")
      .update({ images: JSON.stringify(document) });
    const trx = await db.transaction();
    row.useTransaction(trx);
    try {
      await row.delete();
      assert.equal(files.size, 3);
      await trx.rollback();
      assert.isNotNull(await raw());
      await row.delete();
      assert.isNull(await raw());
      assert.isEmpty(files);
    } finally {
      if (!trx.isCompleted) await trx.rollback();
    }
  });

  test("serializes each item with the v5 custom serializer and supports aliases and pagination", async ({
    assert,
  }) => {
    class Customized extends BaseModel {
      static table = User.table;
      @column({ isPrimary: true }) declare id: string;
      @attachments({
        columnName: "images",
        serializeAs: "photos",
        serialize: (value) => value?.originalName,
      })
      declare gallery: Attachment[] | null;
    }
    Customized.useAdapter(db.modelAdapter());
    await create();
    const page = await Customized.query().paginate(1, 10);
    assert.deepEqual(page.all()[0]!.serialize().photos, ["a.jpg", "b.jpg"]);
    assert.notProperty(page.all()[0]!.serialize(), "gallery");
  });

  test("handles empty and serialized-null JSON without requiring attachment tables", async ({
    assert,
  }) => {
    const row = new User();
    row.id = "42";
    await row.save();
    assert.isNull(row.gallery);
    await db.from(User.table).where("id", "42").update({ images: "null" });
    await row.refresh();
    assert.isNull(row.gallery);
    row.gallery = [await draft()];
    await row.save();
    row.gallery = [];
    await row.save();
    assert.deepEqual(row.serialize().gallery, []);
  });

  test("generates and regenerates collection variants, metadata and blurhash through memory and cold workers", async ({
    assert,
  }) => {
    let resolved: ResolvedAttachmentConfig;
    const failures: unknown[] = [];
    let loaded = 0;
    const application = {
      container: {
        hasBinding: (name: string) =>
          ["lucid.db", "jrmc.attachment.processingAdapters"].includes(name),
        async make(name: string) {
          if (name === "jrmc.attachment") return service;
          if (name === "jrmc.attachment.processingAdapters")
            return resolved.processingAdapters;
          if (name === "jrmc.attachment.repository") return resolved.repository;
          if (name === "jrmc.attachment.converters") return resolved.converters;
          throw new Error(`Unexpected binding ${name}`);
        },
      },
    };
    resolved = await defineConfig({
      defaultDisk: "fs",
      route: false,
      storage,
      queue: {
        default: "memory",
        connections: {
          memory: {
            driver: "memory",
            concurrency: 1,
            onFailure(_job, error) {
              failures.push(error);
            },
          },
        },
      },
      integrations: {
        legacy: {
          models: {
            [User.table]: async () => {
              loaded++;
              return { default: User };
            },
          },
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
                  blurhash: "generated-hash",
                };
              },
            },
          }),
        },
      },
    }).resolver(application as never);
    service = new AttachmentService(resolved);
    manager = new AttachmentManager(service);
    setApp(application as never);
    const row = await create();
    await (resolved.queue as MemoryAttachmentQueue).drain();
    assert.isEmpty(failures);
    assert.isAbove(loaded, 0);
    await row.refresh();
    for (const item of row.gallery!) {
      assert.deepEqual(item.meta, { inspected: true });
      assert.equal(item.getVariant("thumbnail")!.blurhash, "generated-hash");
      assert.deepEqual(item.getVariant("thumbnail")!.meta, { inspected: true });
    }
    assert.equal(
      row.serialize().gallery[0].thumbnail.blurhash,
      "generated-hash",
    );
    const oldIds = row.gallery!.map((item) => item.getVariant("thumbnail")!.id);
    assert.deepEqual(
      await new AttachmentRegenerator()
        .row(row, { attributes: ["gallery"], variants: ["thumbnail"] })
        .run(),
      { rows: 1, attachments: 2 },
    );
    await (resolved.queue as MemoryAttachmentQueue).drain();
    assert.isEmpty(failures);
    await row.refresh();
    assert.notDeepEqual(
      row.gallery!.map((item) => item.getVariant("thumbnail")!.id),
      oldIds,
    );
    const target = row.gallery![0]!.file();
    const worker = createLucidAttachmentProcessor(application as never);
    const job: AttachmentJob = {
      type: "generate-variants",
      attachmentId: target.id,
      reference: target.reference!,
      variantKeys: ["thumbnail"],
      mode: "replace",
    };
    await worker.process(JSON.parse(JSON.stringify(job)));
    await (resolved.queue as MemoryAttachmentQueue).drain();
    await row.refresh();
    row.gallery!.splice(0, 1);
    await row.save();
    await assert.rejects(
      () => worker.process(JSON.parse(JSON.stringify(job))),
      /not found/i,
    );
    assert.equal(files.size, 2);
    assert.isEmpty(failures);
  });
});
