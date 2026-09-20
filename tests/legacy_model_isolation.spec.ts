import { readFile } from "node:fs/promises";
import { setApp } from "@adonisjs/core/services/app";
import { BaseModel, column } from "@adonisjs/lucid/orm";
import { test } from "@japa/runner";
import { AttachmentService } from "../src/core/attachment_service.js";
import {
  attachment,
  Attachment,
  AttachmentManager,
} from "../src/integrations/legacy/index.js";
import {
  attachment as tableAttachment,
  AttachmentRelation,
} from "../src/integrations/lucid/index.js";
import { createLucidTestDatabase } from "./helpers/lucid_test_database.js";
import { defineConfig } from "../src/define_config.js";

class Mixed extends BaseModel {
  static table = "isolated_users";
  static selfAssignPrimaryKey = true;
  @column({ isPrimary: true }) declare id: string;
  @column() declare name: string;
  @attachment({ rename: false, variants: [] })
  declare avatar: Attachment | null;
  @tableAttachment({ variants: [] }) declare document: AttachmentRelation;
  @attachment({ rename: false, variants: [] }) declare cover: Attachment | null;
}
class Reverse extends BaseModel {
  static table = "isolated_users";
  static selfAssignPrimaryKey = true;
  @column({ isPrimary: true }) declare id: string;
  @column() declare name: string;
  @tableAttachment({ variants: [] }) declare document: AttachmentRelation;
  @attachment({ variants: [] }) declare avatar: Attachment | null;
}

test.group("Legacy isolation and shared Lucid transactions", (group) => {
  let db: Awaited<ReturnType<typeof createLucidTestDatabase>>;
  let manager: AttachmentManager;
  let service: AttachmentService;
  const files = new Set<string>();
  const draft = (name: string) =>
    manager.createFromBuffer(new Uint8Array([1]), name);
  group.setup(async () => {
    db = await createLucidTestDatabase();
    Mixed.useAdapter(db.modelAdapter());
    Reverse.useAdapter(db.modelAdapter());
    await db.connection().schema.createTable("isolated_users", (table) => {
      table.string("id").primary();
      table.string("name");
      table.text("avatar");
      table.text("cover");
    });
  });
  group.each.setup(async () => {
    await db.from("adonis_attachment_links").delete();
    await db.from("adonis_attachments").delete();
    await db.from("isolated_users").delete();
    files.clear();
    service = new AttachmentService({
      defaultDisk: "fs",
      queue: { async enqueue() {} },
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

  test("rejects the former JSON relation API at runtime and in public types", ({
    assert,
  }) => {
    class Invalid extends BaseModel {}
    assert.throws(
      () =>
        // @ts-expect-error JSON is intentionally no longer a Lucid relation option.
        tableAttachment({ persistence: "json" })(Invalid.prototype, "avatar"),
      /must use \/legacy/,
    );
    assert.throws(
      () =>
        // @ts-expect-error Column mappings belong to legacy fields, not table relations.
        tableAttachment({ columnName: "avatar" })(Invalid.prototype, "image"),
      /must use \/legacy/,
    );
    // @ts-expect-error Table relation types no longer have a persistence parameter.
    type RemovedGeneric = AttachmentRelation<"json">;
  });

  test("keeps JSON implementations out of table relations, workers and model coordination", async ({
    assert,
  }) => {
    for (const path of [
      "relations/attachment_relation",
      "create_lucid_attachment_processor",
      "model/attachment_model_hooks",
      "regeneration/attachment_regenerator",
    ]) {
      const source = await readFile(
        new URL("../src/integrations/lucid/" + path + ".js", import.meta.url),
        "utf8",
      );
      assert.notMatch(source, /from\s+['"][^'"]*(?:legacy|\/json\/)/);
      assert.notInclude(source, "LucidJson");
      assert.notInclude(source, "adapter === 'json'");
    }
    const exports = await import("@jrmc/adonis-attachment/lucid");
    for (const key of [
      "LucidJsonAttachmentStore",
      "LucidJsonAttachmentRegistry",
      "JsonAttachmentRecord",
    ])
      assert.notProperty(exports, key);
    assert.notProperty(
      await import("@jrmc/adonis-attachment"),
      "AttachmentMetadataConflictError",
    );
    assert.isFunction(
      (await import("@jrmc/adonis-attachment/legacy"))
        .AttachmentMetadataConflictError,
    );
  });

  test("activates legacy explicitly and rejects the former or disabled configuration", async ({
    assert,
  }) => {
    const storage = {
      async write() {},
      async read() {
        return new Uint8Array();
      },
      async remove() {},
    };
    const app = { container: { hasBinding: () => true } } as never;
    const modern = await defineConfig({
      storage,
      queue: { async enqueue() {} },
    }).resolver(app);
    assert.deepEqual(modern.processingAdapters, {});
    await assert.rejects(
      () =>
        defineConfig({
          storage,
          integrations: {
            // @ts-expect-error JSON model mapping now belongs exclusively to integrations.legacy.
            lucid: { jsonModels: {} },
          },
        }).resolver(app),
      /integrations.legacy.models/,
    );
    await assert.rejects(
      () =>
        defineConfig({
          storage,
          integrations: {
            lucid: false,
            legacy: { models: {} },
          },
        }).resolver(app),
      /require the Lucid integration/,
    );
  });

  test("rejects duplicate fields across integrations in both declaration orders", ({
    assert,
  }) => {
    class First extends BaseModel {}
    class Second extends BaseModel {}
    tableAttachment()(First.prototype, "avatar");
    assert.throws(
      () => attachment()(First.prototype, "avatar"),
      /already declared/,
    );
    attachment()(Second.prototype, "avatar");
    assert.throws(
      () => tableAttachment()(Second.prototype, "avatar"),
      /already declared/,
    );
  });

  test("takes over generated columns and rejects duplicate legacy JSON columns", ({
    assert,
  }) => {
    class GeneratedSchema extends BaseModel {
      @column() declare avatar: string;
    }
    class GeneratedModel extends GeneratedSchema {}
    attachment()(GeneratedModel.prototype, "avatar");
    assert.isFalse(GeneratedModel.$hasColumn("avatar"));
    assert.isTrue(GeneratedSchema.$hasColumn("avatar"));

    class Duplicate extends BaseModel {}
    attachment({ columnName: "image" })(Duplicate.prototype, "avatar");
    assert.throws(
      () => attachment({ columnName: "image" })(Duplicate.prototype, "cover"),
      /same JSON column/,
    );
  });

  test("restores two legacy fields and a table relation on outer rollback then retries", async ({
    assert,
  }) => {
    const row = new Mixed();
    row.id = "42";
    row.name = "Alice";
    const avatar = await draft("avatar.jpg");
    const cover = await draft("cover.jpg");
    row.avatar = avatar;
    row.cover = cover;
    row.document.set(
      service.createDraft(
        { body: new Uint8Array([1]), originalName: "doc.txt" },
        { variants: [] },
      ),
    );
    const trx = await db.transaction();
    row.useTransaction(trx);
    try {
      await row.save();
      assert.equal(files.size, 3);
      await trx.rollback();
      assert.isFalse(row.$isPersisted);
      assert.strictEqual(row.avatar, avatar);
      assert.strictEqual(row.cover, cover);
      assert.isFalse(avatar.draft()!.isPersisted);
      assert.isFalse(cover.draft()!.isPersisted);
      assert.isEmpty(files);
      assert.isTrue(row.document.hasPending);
      assert.notProperty(row.$extras, "avatar");
      await row.save();
      assert.equal(files.size, 3);
      assert.equal(
        (await Mixed.findOrFail("42")).cover!.originalName,
        "cover.jpg",
      );
    } finally {
      if (!trx.isCompleted) await trx.rollback();
    }
  });

  test("rolls back ordinary attributes and files when a later integration fails", async ({
    assert,
  }) => {
    const row = new Mixed();
    row.id = "42";
    row.name = "Alice";
    const avatar = await draft("avatar.jpg");
    row.avatar = avatar;
    row.document.attachExisting("missing");
    await assert.rejects(() => row.save(), /not found/);
    assert.isFalse(row.$isPersisted);
    assert.isEmpty(await db.from("isolated_users"));
    assert.isEmpty(files);
    assert.strictEqual(row.avatar, avatar);
    assert.isFalse(avatar.draft()!.isPersisted);
  });

  test("purges mixed fields with deferred cleanup regardless of declaration order", async ({
    assert,
  }) => {
    for (const Model of [Mixed, Reverse]) {
      const row = new Model();
      row.id = Model.name;
      row.name = "Alice";
      row.avatar = await draft(Model.name + ".jpg");
      row.document.set(
        service.createDraft(
          { body: new Uint8Array([1]), originalName: Model.name + ".txt" },
          { variants: [] },
        ),
      );
      await row.save();
      const trx = await db.transaction();
      row.useTransaction(trx);
      try {
        await row.delete();
        assert.equal(files.size, 2);
        await trx.rollback();
        assert.isFalse(row.$isDeleted);
        assert.isNotNull(await Model.find(row.id));
        await row.delete();
        assert.isEmpty(files);
        assert.isNull(await Model.find(row.id));
      } finally {
        if (!trx.isCompleted) await trx.rollback();
      }
    }
  });

  test("checks column mappings again at save time before inserting the owner", async ({
    assert,
  }) => {
    class Late extends BaseModel {
      static table = "isolated_users";
      @column({ isPrimary: true }) declare id: string;
    }
    Late.useAdapter(db.modelAdapter());
    attachment({ columnName: "avatar" })(Late.prototype, "image");
    column({ columnName: "avatar" })(Late.prototype, "rawAvatar");
    const row = new Late();
    row.id = "42";
    await assert.rejects(() => row.save(), /must not also be declared/);
    assert.isEmpty(await db.from("isolated_users"));
  });
});
