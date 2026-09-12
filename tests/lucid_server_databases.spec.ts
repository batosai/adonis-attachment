import { randomUUID } from "node:crypto";
import knex from "knex";
import { Database } from "@adonisjs/lucid/database";
import { BaseModel, column } from "@adonisjs/lucid/orm";
import { test } from "@japa/runner";
import { DateTime } from "luxon";
import { AttachmentService } from "../src/core/attachment_service.js";
import { LucidAttachmentLifecycleService } from "../src/integrations/lucid/persistence/lucid_attachment_lifecycle_service.js";
import type { Attachment } from "../src/core/attachment.js";
import { AttachmentModel } from "../src/integrations/lucid/models/attachment_model.js";
import { AttachmentLinkModel } from "../src/integrations/lucid/models/attachment_link_model.js";
import { LucidAttachmentStore } from "../src/integrations/lucid/persistence/lucid_attachment_store.js";
import { AttachmentSchemaService } from "../src/integrations/lucid/schema/attachment_schema_service.js";
import { withAttachmentReference } from "../src/core/attachment_reference.js";
import { resolveAttachment } from "../src/core/attachment_repository.js";
import { LucidAttachmentRepository } from "../src/integrations/lucid/persistence/lucid_attachment_repository.js";
import { LucidAttachmentMetadataPersister } from "../src/integrations/lucid/persistence/lucid_attachment_metadata_persister.js";
import { LucidJsonAttachmentStore } from "../src/integrations/legacy/json/lucid_json_attachment_store.js";
import { AttachmentLifecycleService } from "../src/core/attachment_lifecycle_service.js";
import { setApp } from "@adonisjs/core/services/app";
import type { AttachmentJob } from "../src/core/queue.js";
import { attachment, AttachmentRelation, createLucidAttachmentProcessor } from "../src/integrations/lucid/index.js";
import { attachment as legacyAttachment, Attachment as LegacyAttachment, AttachmentManager as LegacyManager } from "../src/integrations/legacy/index.js";

import { createLegacyAttachmentAdapter } from "../src/integrations/legacy/config.js";
const client = process.env.ATTACHMENT_TEST_CLIENT;
// Opt-in: the container runner supplies a fresh disposable database for each engine.
if (
  client === "pg" ||
  client === "mssql" ||
  client === "oracledb" ||
  client === "mysql2" ||
  client === "sqlite3" ||
  client === "libsql" ||
  client === "better-sqlite3"
) {
  const sqlite =
    client === "sqlite3" || client === "libsql" || client === "better-sqlite3";
  const owner = {
    type: "users",
    id: "42",
    field: "gallery",
    lock: { table: "users", column: "id", value: "42" },
  };
  const makeAttachment = (): Attachment => ({
    id: randomUUID(),
    disk: "fs",
    path: `${randomUUID()}.jpg`,
    name: "image.jpg",
    originalName: "image.jpg",
    mimeType: "image/jpeg",
    extname: "jpg",
    size: 42,
    metadata: { width: 100, caption: "été" },
  });
  class User extends BaseModel {
    static table = "users";
    @column({ isPrimary: true }) declare id: string;
  }
  class JsonUser extends BaseModel {
    static table = "users";
    static selfAssignPrimaryKey = true;
    @column({ isPrimary: true }) declare id: string;
    @column() declare name: string;
    @legacyAttachment({ variants: [], meta: true }) declare avatar: LegacyAttachment | null;
    @attachment({ variants: [] }) declare document: AttachmentRelation;
  }
  let database: Database;
  class LegacyUser extends BaseModel {
    static table = "users";
    static selfAssignPrimaryKey = true;
    @column({ isPrimary: true }) declare id: string;
    @column() declare name: string;
    @legacyAttachment({ variants: ["thumbnail"], meta: true, preComputeUrl: true }) declare avatar: LegacyAttachment | null;
  }
  let schema: AttachmentSchemaService;
  const jsonOwner = { type: "users", id: "42", field: "avatar" };
  const jsonGallery = { ...jsonOwner, field: "gallery" };
  const jsonStore = (kind: "one" | "many" = "one", connection = database.connection()) => new LucidJsonAttachmentStore({
    client: connection, table: "users", column: kind === "one" ? "avatar" : "gallery",
    owner: kind === "one" ? jsonOwner : jsonGallery, kind, defaultDisk: "fs",
  });

  test.group(
    `Lucid database: ${process.env.ATTACHMENT_TEST_ENGINE ?? client}`,
    (group) => {
      group.setup(async () => {
        const serverPort = Number(process.env.ATTACHMENT_TEST_PORT);
        const mssqlConnection = {
          host: "127.0.0.1",
          server: "127.0.0.1",
          port: serverPort,
          user: "sa",
          password: "Attachment_Test_42!",
          database: "attachment_test",
          options: { trustServerCertificate: true },
        };
        const oracleConnection = {
          user: "attachment",
          password: "Attachment_Test_42",
          connectString: `127.0.0.1:${serverPort}/FREEPDB1`,
        };
        if (client === "mssql" || client === "oracledb") {
          const admin = knex({
            client,
            connection:
              client === "mssql"
                ? { ...mssqlConnection, database: "master" }
                : { ...oracleConnection, user: "system" },
          });
          try {
            if (client === "mssql")
              await admin.raw("CREATE DATABASE attachment_test");
            else {
              await admin.raw(
                "CREATE TABLESPACE attachment_data DATAFILE '/tmp/attachment_test.dbf' SIZE 20M",
              );
              await admin.raw(
                'CREATE USER attachment IDENTIFIED BY "Attachment_Test_42" DEFAULT TABLESPACE attachment_data QUOTA UNLIMITED ON attachment_data',
              );
              await admin.raw(
                "GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE TRIGGER TO attachment",
              );
            }
          } finally {
            await admin.destroy();
          }
        }
        database = new Database(
          {
            connection: "test",
            connections: {
              test: sqlite
                ? {
                    client,
                    connection: {
                      filename:
                        client === "libsql"
                          ? process.env.ATTACHMENT_TEST_PORT
                            ? `http://127.0.0.1:${process.env.ATTACHMENT_TEST_PORT}`
                            : "file::memory:"
                          : ":memory:",
                    },
                    useNullAsDefault: true,
                    pool: { min: 1, max: 1 },
                  }
                : client === "mssql"
                  ? {
                      client,
                      connection: mssqlConnection,
                      pool: { min: 0, max: 8 },
                    }
                  : client === "oracledb"
                    ? {
                        client,
                        connection: oracleConnection,
                        pool: { min: 0, max: 8 },
                      }
                    : {
                        client,
                        connection: {
                          host: "127.0.0.1",
                          port: Number(process.env.ATTACHMENT_TEST_PORT),
                          user: "attachment",
                          password: "attachment",
                          database: "attachment_test",
                        },
                        pool: { min: 0, max: 8 },
                      },
            },
          },
          {
            trace() {},
            warn(message: string) {
              console.warn(message);
            },
            error(message: string) {
              console.error(message);
            },
          } as never,
          {
            async emit() {},
            async emitSerial() {},
            hasListeners() {
              return false;
            },
          } as never,
        );
        for (const model of [AttachmentModel, AttachmentLinkModel, User, JsonUser, LegacyUser])
          model.useAdapter(database.modelAdapter());
        schema = new AttachmentSchemaService(
          database.connection().getWriteClient(),
        );
        try {
          if (sqlite) await database.rawQuery("PRAGMA foreign_keys = ON");
          const version = await database.rawQuery(
            sqlite
              ? "select sqlite_version() as version"
              : client === "mssql"
                ? "select @@VERSION as version"
                : client === "oracledb"
                  ? 'select banner as "version" from v$version'
                  : "select version() as version",
          );
          console.log(
            "Database version:",
            (client === "pg"
              ? version.rows
              : client === "mysql2"
                ? version[0]
                : version)[0].version,
          );
          await schema.createTables();
          await database.connection().schema.createTable("users", (table) => {
            table.string("id").primary();
            table.string("name").nullable();
            if (client === "oracledb") {
              table.text("avatar").nullable(); table.text("gallery").nullable();
            } else {
              table.json("avatar").nullable(); table.json("gallery").nullable();
            }
          });
          await database.table("users").insert({ id: "42" });
        } catch (error) {
          if (error instanceof AggregateError) {
            for (const cause of error.errors)
              console.error("Database error:", cause.message);
          }
          await database.manager.closeAll();
          throw error;
        }
      });
      group.each.setup(async () => {
        await database.from("adonis_attachment_links").delete();
        await database.from("adonis_attachments").delete();
        await database.from("users").whereNot("id", "42").delete();
        await database.from("users").where("id", "42").update({ avatar: null, gallery: null });
      });
      group.teardown(async () => {
        await database?.manager.closeAll();
      });

      test("persists legacy values, worker variants and concurrent meta edits with rollback", async ({ assert }) => {
        const adapter = createLegacyAttachmentAdapter({ models: { users: async () => ({ default: LegacyUser }) }, defaultDisk: "fs" });
        const registry = adapter.repository;
        const jobs: AttachmentJob[] = [];
        const files = new Set<string>();
        const service = new AttachmentService({ defaultDisk: "fs", queue: { async enqueue(job) { jobs.push(job); } }, storage: {
          async write(file) { files.add(file.path); }, async read() { return new Uint8Array([1]); }, async remove(file) { files.delete(file.path); },
          async getUrl(file) { return `https://cdn.test/${file.path}`; },
        } });
        const app = { container: { async make() { return service; } } }; setApp(app as never);
        const manager = new LegacyManager(service);
        const row = await LegacyUser.findOrFail("42"); row.avatar = await manager.createFromBuffer(new Uint8Array([1]), "avatar.jpg");
        row.avatar.meta = { caption: "été", nested: { left: true } }; await row.save();
        assert.equal(row.serialize().avatar.meta.caption, "été");
        const a = await LegacyUser.findOrFail("42"); const b = await LegacyUser.findOrFail("42");
        a.avatar!.meta!.credit = "Alice"; b.avatar!.meta!.description = "Bob";
        await Promise.all([a.save(), b.save()]);
        await row.refresh();
        assert.deepEqual(row.avatar!.meta, { caption: "été", nested: { left: true }, credit: "Alice", description: "Bob" });
        const worker = createLucidAttachmentProcessor(app as never, { adapters: { [adapter.name]: adapter }, converters: {
          async keys() { return ["thumbnail"]; }, async get() { return { key: "thumbnail", async convert() {
            return { body: new Uint8Array([2]), fileName: "thumb.jpg", mimeType: "image/jpeg" };
          } }; },
        } });
        await worker.process(JSON.parse(JSON.stringify(jobs.find((job) => job.type === "generate-variants"))));
        await row.refresh();
        assert.isNotNull(row.avatar!.getVariant("thumbnail"));
        row.avatar!.getVariant("thumbnail")!.meta = { caption: "Small" }; await row.save();
        assert.equal(row.serialize().avatar.thumbnail.meta.caption, "Small");
        const replacement = await manager.createFromBuffer(new Uint8Array([3]), "new.jpg");
        const trx = await database.transaction();
        try {
          row.useTransaction(trx); row.avatar = replacement; await row.save(); await trx.rollback();
          assert.strictEqual(row.avatar, replacement); assert.isFalse(replacement.draft()!.isPersisted);
          assert.equal(files.size, 2);
          await row.save(); assert.equal(files.size, 1);
          row.avatar = null; await row.save(); assert.isEmpty(files);
          assert.isNull((await LegacyUser.findOrFail("42")).avatar);
        } finally { if (!trx.isCompleted) await trx.rollback(); }
        assert.isEmpty(await database.from("adonis_attachments"));
      });

      test("routes JSON model worker jobs and preserves worker updates when a stale model saves", async ({ assert }) => {
        const adapter = createLegacyAttachmentAdapter({ models: { users: async () => ({ default: JsonUser }) }, defaultDisk: "fs" });
        const registry = adapter.repository;
        const jobs: AttachmentJob[] = [];
        const files = new Set<string>();
        const service = new AttachmentService({
          defaultDisk: "fs", metadataMode: "deferred", metadataPersister: registry,
          metadataExtractors: [{ async extract() { return { caption: "été", inspected: true }; } }],
          queue: { async enqueue(job) { jobs.push(job); } },
          storage: { async write(value) { files.add(value.path); }, async read() { return new Uint8Array([1]); }, async remove(value) { files.delete(value.path); } },
        });
        const app = { container: { async make() { return service; } } };
        setApp(app as never);
        const row = await JsonUser.findOrFail("42");
        row.avatar = new LegacyAttachment(service.createDraft({ originalName: "avatar.jpg", body: new Uint8Array([1]) }), service);
        await row.save();
        const stale = await JsonUser.findOrFail("42");
        const worker = createLucidAttachmentProcessor(app as never, { adapters: { [adapter.name]: adapter }, converters: {
          async keys() { return ["thumbnail"]; },
          async get() { return { key: "thumbnail", async convert() { return { body: new Uint8Array([2]), fileName: "thumb.jpg", mimeType: "image/jpeg" }; } }; },
        } });
        await service.scheduleVariantGeneration(row.avatar!.file(), ["thumbnail"], true, undefined, "replace");
        for (const job of [...jobs].filter((job) => job.type === "generate-variants")) await worker.process(JSON.parse(JSON.stringify(job)));
        for (const job of [...jobs].filter((job) => job.type === "extract-metadata")) await worker.process(JSON.parse(JSON.stringify(job)));
        stale.name = "updated";
        await stale.save();
        assert.deepEqual((await JsonUser.findOrFail(stale.id)).avatar!.meta, { caption: "été", inspected: true });
        assert.deepEqual((await JsonUser.findOrFail(stale.id)).avatar!.variants[0]!.meta, { caption: "été", inspected: true });
        assert.equal(files.size, 2);
        assert.isEmpty(await database.from("adonis_attachments"));
      });

      test("rolls back JSON model creation and mixed-field deletion with deferred file cleanup", async ({ assert }) => {
        const files = new Set<string>();
        const service = new AttachmentService({ defaultDisk: "fs", queue: { async enqueue() {} }, storage: {
          async write(value) { files.add(value.path); }, async read() { return new Uint8Array([1]); }, async remove(value) { files.delete(value.path); },
        } });
        setApp({ container: { async make() { return service; } } } as never);
        const row = new JsonUser(); row.id = "43"; row.name = "created";
        row.avatar = new LegacyAttachment(service.createDraft({ originalName: "avatar.jpg", body: new Uint8Array([1]) }), service);
        row.document.set(service.createDraft({ originalName: "doc.txt", body: new Uint8Array([1]) }));
        const creation = await database.transaction();
        try {
          row.useTransaction(creation); await row.save();
          assert.equal(files.size, 2);
          await creation.rollback();
          assert.isFalse(row.$isPersisted);
          assert.isFalse(row.avatar!.draft()!.isPersisted);
          assert.notProperty(row.$extras, "avatar");
          assert.isEmpty(files);
        } finally { if (!creation.isCompleted) await creation.rollback(); }
        await row.save();
        const deletion = await database.transaction();
        try {
          row.useTransaction(deletion); await row.delete();
          assert.equal(files.size, 2);
          await deletion.rollback();
          assert.isFalse(row.$isDeleted);
          assert.isNotNull(row.avatar);
          await row.delete();
          assert.isEmpty(files);
          assert.isNull(await JsonUser.find("43"));
          assert.isEmpty(await database.from("adonis_attachments"));
        } finally { if (!deletion.isCompleted) await deletion.rollback(); }
      });

      test("merges concurrent JSON metadata changes without dropping variants or unrelated nested keys", async ({ assert }) => {
        const adapter = jsonStore();
        const before = { caption: "old", details: { author: "Alice", remove: "old" } };
        const original = await adapter.createOriginal(jsonOwner, { ...makeAttachment(), metadata: before });
        const snapshot = original.toAttachment();
        const variant = makeAttachment();
        await Promise.all([
          ...Array.from({ length: 16 }, (_, index) => jsonStore().persistMetadata(snapshot, { ...before, [`key${index}`]: index })),
          jsonStore().createVariant(original, "thumbnail", variant),
          jsonStore().patchMetadata(snapshot, before, { ...before, details: { ...before.details, language: "fr" } }),
        ]);
        const merged = await adapter.patchMetadata(snapshot, before, { caption: "été", details: { author: "Bob" } });
        assert.deepEqual(merged.metadata, {
          ...Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`key${index}`, index])),
          caption: "été", details: { author: "Bob", language: "fr" },
        });
        assert.equal((await adapter.listVariants(original.id))[0]!.id, variant.id);
        assert.deepEqual((await adapter.findOriginal(jsonOwner))!.toAttachment().metadata, merged.metadata);
      });

      test("rejects conflicting JSON metadata changes atomically and preserves outer rollback", async ({ assert }) => {
        const adapter = jsonStore();
        const original = await adapter.createOriginal(jsonOwner, { ...makeAttachment(), metadata: { caption: "old" } });
        const snapshot = original.toAttachment();
        await adapter.persistMetadata(snapshot, { caption: "winner", width: 100 });
        await assert.rejects(() => adapter.patchMetadata(snapshot, snapshot.metadata, { added: true, caption: "loser" }), /metadata changed concurrently/);
        assert.deepEqual((await adapter.findOriginal(jsonOwner))!.toAttachment().metadata, { caption: "winner", width: 100 });
        const outer = await database.transaction();
        try {
          const scoped = jsonStore("one", outer);
          const current = (await scoped.findOriginal(jsonOwner))!.toAttachment();
          const updated = await scoped.patchMetadata(current, current.metadata, { ...current.metadata, caption: "outer" });
          await assert.rejects(() => scoped.patchMetadata(current, current.metadata, { caption: "conflict" }), /metadata changed concurrently/);
          assert.deepEqual((await scoped.findOriginal(jsonOwner))!.toAttachment().metadata, updated.metadata);
          await outer.rollback();
          assert.deepEqual((await adapter.findOriginal(jsonOwner))!.toAttachment().metadata, current.metadata);
        } finally { if (!outer.isCompleted) await outer.rollback(); }
        await adapter.remove(original);
        await assert.rejects(() => adapter.patchMetadata(snapshot, snapshot.metadata, { caption: "late" }), /not found/);
      });

      test("reads legacy JSON without writes and persists large metadata with stable identities", async ({ assert }) => {
        const legacy = { name: "old.jpg", size: 42, extname: "jpg", mimeType: "image/jpeg", custom: "keep", meta: { caption: "été" }, variants: [
          { name: "thumb.jpg", key: "thumbnail", size: 1, extname: "jpg", mimeType: "image/jpeg" },
        ] };
        await database.from("users").where("id", "42").update({ avatar: JSON.stringify(legacy) });
        const before = (await database.from("users").where("id", "42").first()).avatar;
        const store = jsonStore();
        const original = (await store.findOriginal(jsonOwner))!;
        assert.equal(original.toAttachment().path, "old.jpg");
        assert.deepEqual((await database.from("users").where("id", "42").first()).avatar, before);
        const metadata = { caption: "été".repeat(4000) };
        await store.persistMetadata(original.toAttachment(), metadata);
        assert.equal((await store.findOriginal(jsonOwner))!.id, original.id);
        assert.deepEqual((await store.findByReference(original.toAttachment().reference!))!.metadata, metadata);
        assert.lengthOf(await store.listVariants(original.id), 1);
        const value = (await database.from("users").where("id", "42").first()).avatar;
        const document = typeof value === "string" ? JSON.parse(value) : value;
        assert.equal(document.custom, "keep");
        assert.equal(document.id, original.id);
      });

      test("serializes JSON collection inserts and enforces singular ownership", async ({ assert }) => {
        const attachments = Array.from({ length: 16 }, makeAttachment);
        await Promise.all(attachments.map((attachment) => jsonStore("many").createCollectionItem(jsonGallery, attachment)));
        const items = await jsonStore("many").listCollection(jsonGallery);
        assert.sameMembers(items.map((item) => item.id), attachments.map((attachment) => attachment.id));
        assert.deepEqual(items.map((item) => item.position), Array.from({ length: 16 }, (_, index) => index));
        await jsonStore("many").moveCollectionItem(jsonGallery, items[15]!.id, 0);
        assert.equal((await jsonStore("many").listCollection(jsonGallery))[0]!.id, items[15]!.id);
        const results = await Promise.allSettled([makeAttachment(), makeAttachment()].map((attachment) => jsonStore().createOriginal(jsonOwner, attachment)));
        assert.lengthOf(results.filter((result) => result.status === "fulfilled"), 1);
        assert.lengthOf(results.filter((result) => result.status === "rejected"), 1);
      });

      test("preserves JSON savepoint rollback and defers lifecycle file cleanup", async ({ assert }) => {
        const outer = await database.transaction();
        const calls: string[] = [];
        const old = makeAttachment();
        const replacement = makeAttachment();
        try {
          const store = jsonStore("one", outer);
          await store.createOriginal(jsonOwner, old);
          await assert.rejects(() => store.transaction(jsonOwner, async (scoped) => {
            const entry = (await scoped.findOriginal(jsonOwner))!;
            await scoped.remove(entry);
            throw new Error("abort JSON scope");
          }), /abort JSON scope/);
          assert.equal((await store.findOriginal(jsonOwner))!.id, old.id);
          const lifecycle = new AttachmentLifecycleService({
            async create() { return replacement; },
            async remove(attachment) { calls.push(attachment.id); },
          }, store);
          await lifecycle.replace(jsonOwner, { body: new Uint8Array([1]), originalName: "new.jpg" });
          assert.isEmpty(calls);
          await outer.rollback();
          assert.deepEqual(calls, [replacement.id]);
          assert.isNull(await jsonStore().findOriginal(jsonOwner));
        } finally { if (!outer.isCompleted) await outer.rollback(); }
      });

      test("rejects stale JSON variant and metadata writes and removes originals with variants", async ({ assert }) => {
        const store = jsonStore();
        const original = await store.createOriginal(jsonOwner, makeAttachment());
        const variants = await Promise.all(Array.from({ length: 8 }, () => store.replaceVariant(original, "thumbnail", makeAttachment())));
        assert.lengthOf(await store.listVariants(original.id), 1);
        const latest = (await store.listVariants(original.id))[0]!;
        const stale = variants.find((result) => result.variant.id !== latest.id)!.variant;
        await assert.rejects(() => store.persistMetadata(stale.toAttachment(), { stale: true }), /not found/);
        const removed = await store.remove(original);
        assert.sameMembers(removed.map((record) => record.id), [original.id, latest.id]);
        await store.createOriginal(jsonOwner, makeAttachment());
        await assert.rejects(() => store.createVariant(original, "late", makeAttachment()), /not found/);
        assert.isNull(await store.findByReference(original.toAttachment().reference!));
      });

      test("round-trips blobs and JSON, orders, moves and removes links", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const first = await store.createCollectionItem(owner, makeAttachment());
        const second = await store.createCollectionItem(
          owner,
          makeAttachment(),
          0,
        );
        assert.deepEqual(
          (await store.listCollection(owner)).map((item) => item.id),
          [second.id, first.id],
        );
        assert.deepEqual((await store.findById(first.attachmentId))!.metadata, {
          width: 100,
          caption: "été",
        });
        assert.strictEqual(
          (await store.findById(first.attachmentId))!.toAttachment().size,
          42,
        );
        await store.moveCollectionItem(owner, first.id, 0);
        await store.removeCollectionItem(owner, second);
        assert.deepEqual(
          (await store.listCollection(owner)).map((item) => item.position),
          [0],
        );
        assert.isNull(await store.findById(second.attachmentId));
      });

      test("resolves explicit table references without storing runtime locator fields", async ({ assert }) => {
        const attachment = makeAttachment();
        const reference = { version: 1 as const, adapter: "tables", id: attachment.id };
        const contextual = withAttachmentReference({ ...attachment, url: "/runtime-only" }, reference);
        const store = new LucidAttachmentStore();
        const link = await store.createCollectionItem(owner, contextual);
        const repository = new LucidAttachmentRepository();
        const resolved = await resolveAttachment(repository, attachment.id, reference);
        assert.deepEqual(resolved!.reference, reference);
        assert.equal(resolved!.path, attachment.path);
        assert.notProperty((await store.findById(attachment.id))!.toAttachment(), "reference");
        assert.notProperty((await store.findById(attachment.id))!.toAttachment(), "url");
        await new LucidAttachmentMetadataPersister().persistMetadata(resolved!, { caption: "updated" });
        assert.deepEqual((await repository.findById(attachment.id))!.metadata, { caption: "updated" });
        await store.removeCollectionItem(owner, link);
        assert.isNull(await resolveAttachment(repository, attachment.id, reference));
      });

      test(`serializes 16 simultaneous inserts (${sqlite ? "one SQLite connection" : "eight pooled connections"})`, async ({
        assert,
      }) => {
        const attachments = Array.from({ length: 16 }, makeAttachment);
        await Promise.all(
          attachments.map((attachment) =>
            new LucidAttachmentStore().createCollectionItem(owner, attachment),
          ),
        );
        const items = await new LucidAttachmentStore().listCollection(owner);
        assert.deepEqual(
          items.map((item) => item.position),
          Array.from({ length: 16 }, (_, i) => i),
        );
        assert.sameMembers(
          items.map((item) => item.attachmentId),
          attachments.map((item) => item.id),
        );
      }).timeout(30000);

      test("reads BIGINT sizes as numbers and rejects unsafe precision", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const attachment = { ...makeAttachment(), size: 5_000_000_000 };
        await store.createCollectionItem(owner, attachment);
        assert.strictEqual(
          (await store.findById(attachment.id))!.size,
          attachment.size,
        );
        await database
          .from("adonis_attachments")
          .where("id", attachment.id)
          .update({ size: "9007199254740993" });
        // The remote LibSQL driver rejects unsafe integers before Lucid consumes them.
        await assert.rejects(
          () => store.findById(attachment.id),
          /safe integer|cannot be safely represented/,
        );
      });

      test("also serializes an empty collection using a Lucid model owner", async ({
        assert,
      }) => {
        const modelOwner = {
          type: "users",
          id: "42",
          field: "gallery",
          model: await User.findOrFail("42"),
        };
        await Promise.all(
          Array.from({ length: 8 }, () =>
            new LucidAttachmentStore().createCollectionItem(
              modelOwner,
              makeAttachment(),
            ),
          ),
        );
        assert.deepEqual(
          (await new LucidAttachmentStore().listCollection(owner)).map(
            (item) => item.position,
          ),
          [0, 1, 2, 3, 4, 5, 6, 7],
        );
      }).timeout(30000);

      test("rolls back a failing nested insert even when the outer transaction commits", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const first = await store.createCollectionItem(owner, makeAttachment());
        await store.createCollectionItem(owner, makeAttachment());
        const failed = makeAttachment();
        await database.transaction(async (trx) => {
          const failing = new LucidAttachmentStore(undefined, {
            client: trx,
            createLinkId: () => first.id,
          });
          await assert.rejects(() =>
            failing.createCollectionItem(owner, failed, 0),
          );
        });
        assert.isNull(await store.findById(failed.id));
        assert.deepEqual(
          (await store.listCollection(owner)).map((item) => item.position),
          [0, 1],
        );
      });

      test("rejects missing owner rows and, on server row-lock engines, missing locks", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const attachment = makeAttachment();
        if (!sqlite)
          await assert.rejects(() =>
            store.createCollectionItem(
              { type: "users", id: "42", field: "gallery" },
              attachment,
            ),
          );
        await assert.rejects(() =>
          store.createCollectionItem(
            { ...owner, lock: { ...owner.lock, value: "missing" } },
            attachment,
          ),
        );
        assert.isNull(await store.findById(attachment.id));
      });

      test("enforces singular ownership and rolls back the losing blob", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const first = makeAttachment();
        const second = makeAttachment();
        const results = await Promise.allSettled(
          [first, second].map((item) => store.createOriginal(owner, item)),
        );
        assert.lengthOf(
          results.filter((result) => result.status === "fulfilled"),
          1,
        );
        assert.lengthOf(
          results.filter((result) => result.status === "rejected"),
          1,
        );
        assert.lengthOf(await AttachmentModel.all(), 1);
        assert.isNotNull(await store.findOriginal(owner));
      });

      test("defers effects to the external transaction commit or rollback", async ({
        assert,
      }) => {
        for (const commit of [true, false]) {
          const outer = await database.transaction();
          const calls: string[] = [];
          const attachment = makeAttachment();
          try {
            const store = new LucidAttachmentStore(undefined, {
              client: outer,
            });
            await store.transaction(owner, async (scoped) => {
              await scoped.createCollectionItem(owner, attachment);
              scoped.afterCommit(() => {
                calls.push("commit");
              });
              scoped.afterRollback(() => {
                calls.push("rollback");
              });
            });
            assert.isEmpty(calls);
            if (commit) await outer.commit();
            else await outer.rollback();
            assert.deepEqual(calls, [commit ? "commit" : "rollback"]);
            assert.equal(
              Boolean(await new LucidAttachmentStore().findById(attachment.id)),
              commit,
            );
          } finally {
            if (!outer.isCompleted) await outer.rollback();
          }
        }
      });

      test("preserves shared blobs until their last link is removed", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const first = await store.createCollectionItem(owner, makeAttachment());
        const otherOwner = { ...owner, field: "other" };
        const second = await store.createCollectionLink(
          otherOwner,
          first.attachmentId,
        );
        await store.removeCollectionItem(owner, first);
        assert.isNotNull(await store.findById(first.attachmentId));
        await store.removeCollectionItem(otherOwner, second);
        assert.isNull(await store.findById(first.attachmentId));
      });

      test("persists timestamp instants and large JSON metadata", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const attachment = {
          ...makeAttachment(),
          metadata: { caption: "été".repeat(4000) },
        };
        const link = await store.createCollectionItem(owner, attachment);
        const original = (await store.findById(link.attachmentId))!;
        assert.deepEqual(original.metadata, attachment.metadata);
        assert.isTrue(original.createdAt.isValid);
        assert.isTrue(link.createdAt.isValid);
        const instant = DateTime.fromISO("2026-09-10T13:14:15.000+02:00");
        original.createdAt = instant;
        await original.save();
        assert.equal(
          (await store.findById(original.id))!.createdAt.toMillis(),
          instant.toMillis(),
        );
      });

      test("rolls back original and variant deletion together, then removes both on commit", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const link = await store.createCollectionItem(owner, makeAttachment());
        const original = (await store.findById(link.attachmentId))!;
        const variant = await store.createVariant(
          original,
          "thumb",
          makeAttachment(),
        );
        assert.equal((await store.findById(variant.id))!.parentId, original.id);
        await assert.rejects(
          () =>
            store.transaction(owner, async (scoped) => {
              await scoped.removeCollectionItem(owner, link);
              assert.isNull(await scoped.findById(original.id));
              assert.isNull(await scoped.findById(variant.id));
              throw new Error("abort deletion");
            }),
          /abort deletion/,
        );
        assert.isNotNull(await store.findById(original.id));
        assert.isNotNull(await store.findById(variant.id));
        assert.lengthOf(await store.listCollection(owner), 1);
        const removed = await store.removeCollectionItem(owner, link);
        assert.sameMembers(
          removed.map((item) => item.id),
          [original.id, variant.id],
        );
        assert.isNull(await store.findById(original.id));
        assert.isNull(await store.findById(variant.id));
      });

      test("keeps the old file until commit and removes only the new file on rollback", async ({
        assert,
      }) => {
        const files = new Set<string>();
        const attachments = new AttachmentService({
          defaultDisk: "fs",
          createId: randomUUID,
          queue: { async enqueue() {} },
          storage: {
            async write(input) {
              files.add(input.path);
            },
            async read() {
              return new Uint8Array();
            },
            async remove(location) {
              files.delete(location.path);
            },
            async getUrl(location) {
              return location.path;
            },
          },
        });
        const input = (name: string) => ({
          body: Buffer.from(name),
          originalName: name,
          mimeType: "text/plain",
        });
        const lifecycle = new LucidAttachmentLifecycleService(
          attachments,
          new LucidAttachmentStore(),
        );
        const previous = await lifecycle.attach(owner, input("before.txt"));
        const previousPath = previous.toAttachment().path;
        const outer = await database.transaction();
        try {
          const staged = new LucidAttachmentLifecycleService(
            attachments,
            new LucidAttachmentStore(undefined, { client: outer }),
          );
          const replacement = await staged.replace(
            owner,
            input("rollback.txt"),
          );
          assert.sameMembers(
            [...files],
            [previousPath, replacement.toAttachment().path],
          );
          await outer.rollback();
          assert.deepEqual([...files], [previousPath]);
          assert.equal(
            (await lifecycle.get(owner))!.attachmentId,
            previous.attachmentId,
          );
        } finally {
          if (!outer.isCompleted) await outer.rollback();
        }
        const replacement = await lifecycle.replace(owner, input("after.txt"));
        assert.deepEqual([...files], [replacement.toAttachment().path]);
        assert.equal(
          (await lifecycle.get(owner))!.attachmentId,
          replacement.attachmentId,
        );
      });

      test("serializes competing first variant replacements and forbids linking variants", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const link = await store.createCollectionItem(owner, makeAttachment());
        const original = (await store.findById(link.attachmentId))!;
        const results = await Promise.all(
          Array.from({ length: 8 }, () =>
            store.replaceVariant(original, "thumb", makeAttachment()),
          ),
        );
        assert.equal(
          new Set(results.map((result) => result.variant.id)).size,
          1,
        );
        const variants = await AttachmentModel.query().where(
          "parent_id",
          original.id,
        );
        assert.lengthOf(variants, 1);
        await assert.rejects(() =>
          store.createCollectionLink(owner, variants[0]!.id),
        );
      }).timeout(30000);

      test("enforces and upgrades the foreign key without losing existing links", async ({
        assert,
      }) => {
        const store = new LucidAttachmentStore();
        const link = await store.createCollectionItem(owner, makeAttachment());
        const deleteBlob = () =>
          database
            .from("adonis_attachments")
            .where("id", link.attachmentId)
            .delete();
        await assert.rejects(deleteBlob);
        await schema.restoreCascadingBlobDeletion();
        await schema.protectReferencedBlobs();
        await assert.rejects(deleteBlob);
        assert.lengthOf(await store.listCollection(owner), 1);
        await schema.restoreCascadingBlobDeletion();
        await deleteBlob();
        assert.isEmpty(await store.listCollection(owner));
        await schema.protectReferencedBlobs();
      });
    },
  );
}
