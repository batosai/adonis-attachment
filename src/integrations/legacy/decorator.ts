import app from "@adonisjs/core/services/app";
import type { LucidModel, LucidRow } from "@adonisjs/lucid/types/model";
import { Attachment } from "./attachment.js";
import { registerAttachmentModelField } from "../lucid/model/attachment_model_hooks.js";
import {
  jsonRelationColumn,
  validateLegacyAttachmentDefinition,
  registerLegacyAttachmentDefinition,
  type LegacyFieldDefinition,
} from "./model_fields.js";
import type { AttachmentPersistenceOptions } from "../../core/attachment_options.js";
import type { AttachmentVariantKey } from "../../../index.js";
import { AttachmentLifecycleService } from "../../core/attachment_lifecycle_service.js";
import type { AttachmentService } from "../../core/attachment_service.js";
import { LucidJsonAttachmentStore } from "./json/lucid_json_attachment_store.js";
import {
  attachmentFromDocument,
  decodeJsonAttachments,
  JsonAttachmentRecord,
} from "./json/json_attachment_document.js";
import { afterAttachmentRollback } from "../lucid/persistence/attachment_transaction.js";
import { AttachmentValidationError } from "../../errors.js";

// One source draft belongs to one field, including before either owner is saved.
const draftOwners = new WeakMap<object, LegacyField>();

export type AttachmentOptions<Model = LucidRow> = Omit<
  AttachmentPersistenceOptions<Model>,
  "folder" | "rename"
> & {
  type?: string;
  columnName?: string;
  folder?: string | ((model: Model) => string | Promise<string>) | null;
  rename?:
    | boolean
    | ((
        model: Model,
        field?: string,
        originalName?: string,
      ) => string | Promise<string>)
    | null;
  serializeAs?: string | null;
  serialize?: (
    value: Attachment | null,
    field: string,
    model: Model,
  ) => unknown;
};

/** Singular v5-style JSON field; never an ordinary writable Lucid column. */
export function attachment<Model = LucidRow>(
  options: AttachmentOptions<Model> = {},
): PropertyDecorator {
  return defineAttachment("one", options);
}

/** V5-style array field. Existing order is retained; new drafts append. */
export function attachments<Model = LucidRow>(
  options: AttachmentOptions<Model> = {},
): PropertyDecorator {
  return defineAttachment("many", options);
}

function defineAttachment<Model>(
  kind: LegacyFieldDefinition["kind"],
  options: AttachmentOptions<Model>,
): PropertyDecorator {
  return (target, key) => {
    const {
      folder,
      rename,
      serializeAs,
      serialize: customSerialize,
      ...rest
    } = options;
    const persistence: LegacyFieldDefinition["options"] = {
      ...rest,
      ...(folder !== undefined
        ? {
            folder:
              typeof folder === "function"
                ? ({ model }) => folder(model as Model)
                : folder,
          }
        : {}),
      ...(rename !== undefined
        ? {
            rename:
              typeof rename === "function"
                ? ({ model, field, originalName }) =>
                    rename(model as Model, field, originalName)
                : rename,
          }
        : {}),
    };
    const ModelClass = target.constructor as LucidModel;
    const field = String(key);
    const definition: LegacyFieldDefinition = {
      kind,
      field,
      options: persistence,
    };
    validateLegacyAttachmentDefinition(ModelClass, definition);
    const instance: (row: LucidRow) => LegacyField =
      registerAttachmentModelField(ModelClass, {
        field,
        transactionalSave: true,
        validate: () => {
          jsonRelationColumn(ModelClass, definition);
        },
        create: (row) => new LegacyField(row, definition),
        beforeDelete: (row) => instance(row).purge(),
        regenerate: (row, keys) => instance(row).regenerate(keys),
      });
    registerLegacyAttachmentDefinition(ModelClass, definition);
    ModelClass.before("create", (row) => {
      if (!instance(row).hasPending) void instance(row).value;
    });
    ModelClass.after("find", (row) => instance(row).initialize());
    ModelClass.after("fetch", async (rows) => {
      await Promise.all(rows.map((row) => instance(row).initialize()));
    });
    const refresh = ModelClass.prototype.refresh;
    ModelClass.prototype.refresh = async function () {
      if (instance(this).hasPending)
        throw new AttachmentValidationError(
          "Save pending legacy attachment changes before refresh()",
        );
      await refresh.call(this);
      await instance(this).initialize(true);
      return this;
    };
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      get(this: LucidRow) {
        return instance(this).value;
      },
      set(this: LucidRow, value: unknown) {
        instance(this).assign(value);
      },
    });
    const serialized =
      serializeAs === undefined
        ? ModelClass.namingStrategy.serializedName(ModelClass, field)
        : serializeAs;
    // Serialize through Lucid's cherry-picking rules without registering a SQL column.
    const serialize = ModelClass.prototype.serializeComputed;
    ModelClass.prototype.serializeComputed = function (
      fields: Parameters<LucidRow["serializeComputed"]>[0],
    ) {
      const result = serialize.call(this, fields);
      if (serialized && this.shouldSerializeField(serialized, fields)) {
        const value = instance(this).value;
        const serializeValue = (item: Attachment | null) =>
          customSerialize
            ? customSerialize(item, field, this as Model)
            : (item?.toJSON() ?? null);
        // Like v5, a collection's custom serializer applies to each attachment.
        result[serialized] = Array.isArray(value)
          ? value.map(serializeValue)
          : value === null && kind === "many"
            ? null
            : serializeValue(value);
      }
      return result;
    };
  };
}

class LegacyField {
  #service?: AttachmentService;
  #value: Attachment | Attachment[] | null = null;
  #baseline: Attachment[] = [];
  #raw: unknown;
  #loaded = false;
  #assigned = false;
  constructor(
    readonly row: LucidRow,
    readonly definition: LegacyFieldDefinition,
  ) {}
  get Model() {
    return this.row.constructor as unknown as LucidModel;
  }
  get column() {
    return jsonRelationColumn(this.Model, this.definition);
  }
  get owner() {
    if (
      !this.row.$isPersisted ||
      this.row.$primaryKeyValue === null ||
      this.row.$primaryKeyValue === undefined
    )
      throw new AttachmentValidationError(
        "Legacy attachments require a persisted Lucid model",
      );
    return {
      type: this.definition.options.type ?? this.Model.table,
      id: String(this.row.$primaryKeyValue),
      field: this.definition.field,
    };
  }
  get hasPending() {
    return (
      this.#assigned ||
      this.#items().some(
        (item) => !(item instanceof Attachment) || item.hasMetadataChanges,
      ) ||
      (this.definition.kind === "many" &&
        (this.#items().length !== this.#baseline.length ||
          this.#baseline.some((item, index) => item !== this.#items()[index])))
    );
  }
  #items(): Attachment[] {
    return Array.isArray(this.#value)
      ? this.#value
      : this.#value
        ? [this.#value]
        : [];
  }
  get value(): Attachment | Attachment[] | null {
    if (
      !this.#assigned &&
      (!this.#loaded || this.#raw !== this.row.$extras[this.column])
    )
      this.#hydrate();
    return this.#value;
  }
  assign(value: unknown): void {
    if (this.definition.kind === "many") {
      // Membership edits are relative to the loaded field, never an unrelated snapshot.
      if (!this.#loaded && !this.#assigned) void this.value;
      if (value !== null && !Array.isArray(value))
        throw new AttachmentValidationError(
          "Assign an array of legacy attachments or null",
        );
      this.#validateCollection(value ?? []);
      this.#value = value;
      this.#assigned = true;
      return;
    }
    if (
      value !== null &&
      value === this.#value &&
      (this.#loaded || this.#assigned)
    )
      return;
    if (
      value !== null &&
      (!(value instanceof Attachment) ||
        !value.draft() ||
        value.draft()!.isPersisted)
    ) {
      throw new AttachmentValidationError(
        "Assign a new legacy attachmentManager draft or null; persisted files cannot be shared",
      );
    }
    if (value instanceof Attachment) {
      const draft = value.draft()!;
      const owner = draftOwners.get(draft);
      if (owner && owner !== this)
        throw new AttachmentValidationError(
          "A legacy draft cannot be assigned to multiple owner fields",
        );
      draftOwners.set(draft, this);
    }
    this.#value = value as Attachment | null;
    this.#assigned = true;
  }
  async initialize(reload = false): Promise<void> {
    this.#service ??= await app.container.make("jrmc.attachment");
    // Lucid refresh() copies $attributes only, not the JSON kept in $extras.
    if (reload && this.row.$isPersisted)
      await this.#store().listOwnerLinks(this.owner);
    // Partial selects are allowed, but accessing an omitted field is explicit failure.
    if (Object.hasOwn(this.row.$extras, this.column)) {
      this.#hydrate();
      if (this.#service.getPreComputeUrlEnabled(this.definition.options))
        await Promise.all(this.#items().map((item) => item.preComputeUrl()));
    }
  }
  #hydrate(): void {
    const raw = this.row.$extras[this.column];
    if (
      this.row.$isPersisted &&
      !Object.hasOwn(this.row.$extras, this.column)
    ) {
      throw new AttachmentValidationError(
        `Legacy attachment "${this.definition.field}" was not selected; load its JSON column first`,
      );
    }
    if (this.hasPending)
      throw new AttachmentValidationError(
        "Save legacy metadata changes before refreshing the attachment snapshot",
      );
    if (raw === null || raw === undefined) {
      this.#raw = raw;
      this.#loaded = true;
      this.#value = null;
      this.#baseline = [];
      return;
    }
    if (!this.#service)
      throw new AttachmentValidationError(
        "Legacy attachment hydration requires Lucid find/fetch hooks",
      );
    const disk = this.#service.getPersistenceDisk(this.definition.options);
    const documents = decodeJsonAttachments(
      raw,
      this.definition.kind,
      this.owner,
      disk,
    );
    const values = documents.map((document) => {
      const file = (value: typeof document, parentId: string | null = null) =>
        new JsonAttachmentRecord(
          value.id,
          this.owner,
          attachmentFromDocument(
            value,
            disk,
            String(document.originalName ?? document.name),
          ),
          parentId,
          parentId ? String(value.key) : null,
        ).toAttachment();
      return new Attachment(
        file(document),
        this.#service!,
        (document.variants ?? []).map(
          (variant) =>
            new Attachment(
              file(variant, document.id),
              this.#service!,
              [],
              String(variant.key),
            ),
        ),
      );
    });
    this.#value =
      this.definition.kind === "many"
        ? typeof raw === "string" && raw.trim() === "null"
          ? null
          : values
        : (values[0] ?? null);
    // Keep membership independent of the public mutable array (push/splice/filter).
    this.#baseline = [...values];
    this.#raw = raw;
    this.#loaded = true;
  }
  async persist(): Promise<void> {
    this.#service ??= await app.container.make("jrmc.attachment");
    const state = {
      value: this.#value,
      assigned: this.#assigned,
      raw: this.#raw,
      loaded: this.#loaded,
      baseline: this.#baseline,
    };
    afterAttachmentRollback(this.row.$trx!, () => {
      this.#value = state.value;
      this.#assigned = state.assigned;
      this.#raw = state.raw;
      this.#loaded = state.loaded;
      this.#baseline = state.baseline;
    });
    const store = this.#store();
    if (this.definition.kind === "many") {
      await this.#persistCollection(store);
    } else if (this.#assigned) {
      const lifecycle = new AttachmentLifecycleService(this.#service, store);
      const owner = { ...this.owner, model: this.row };
      if (this.#value instanceof Attachment) {
        const draft = this.#value.draft()!;
        draft.metadata = structuredClone(this.#value.meta);
        await lifecycle.replace(owner, draft, this.definition.options);
      } else await lifecycle.detach(owner);
    } else if (this.#value instanceof Attachment) {
      const values = [this.#value, ...this.#value.variants];
      await store.transaction(this.owner, async (scoped) => {
        for (const value of values) {
          if (value.hasMetadataChanges) {
            const original = value.file();
            await scoped.patchMetadata(original, original.metadata, value.meta);
          }
        }
      });
    }
    this.#value = null;
    this.#baseline = [];
    this.#assigned = false;
    await this.initialize();
  }
  async purge(): Promise<void> {
    this.#service ??= await app.container.make("jrmc.attachment");
    await new AttachmentLifecycleService(
      this.#service,
      this.#store(),
    ).purgeOwner({ ...this.owner, model: this.row });
  }
  async regenerate(keys?: readonly AttachmentVariantKey[]): Promise<number> {
    this.#service ??= await app.container.make("jrmc.attachment");
    const originals = await this.#store(false).listOwnerLinks(this.owner);
    for (const original of originals)
      await this.#service.scheduleVariantGeneration(
        original.toAttachment(),
        keys,
        this.#service.getVariantMetadataEnabled(
          undefined,
          this.definition.options,
        ),
        undefined,
        "replace",
      );
    return originals.length;
  }
  #validateCollection(values: unknown[]): asserts values is Attachment[] {
    const seen = new Set<Attachment>();
    const drafts: object[] = [];
    let lastIndex = -1;
    let added = false;
    for (const value of values) {
      if (!(value instanceof Attachment))
        throw new AttachmentValidationError(
          "Collections accept only legacy attachments, without null or sparse entries",
        );
      if (seen.has(value))
        throw new AttachmentValidationError(
          "A legacy collection cannot contain duplicate attachments",
        );
      seen.add(value);
      const index = this.#baseline.indexOf(value);
      if (index >= 0) {
        if (added || index < lastIndex)
          throw new AttachmentValidationError(
            "Legacy collections do not support reordering; append new drafts after retained attachments",
          );
        lastIndex = index;
      } else {
        const draft = value.draft();
        if (!draft || draft.isPersisted)
          throw new AttachmentValidationError(
            "Persisted files cannot be shared; retain loaded collection items or append new legacy drafts",
          );
        const owner = draftOwners.get(draft);
        if (owner && owner !== this)
          throw new AttachmentValidationError(
            "A legacy draft cannot be assigned to multiple owner fields",
          );
        drafts.push(draft);
        added = true;
      }
    }
    for (const draft of drafts) draftOwners.set(draft, this);
  }
  async #persistCollection(store: LucidJsonAttachmentStore): Promise<void> {
    const values = this.#items();
    this.#validateCollection(values);
    const retained = new Set(values);
    const removed = this.#baseline.filter((item) => !retained.has(item));
    const added = values.filter((item) => !this.#baseline.includes(item));
    const clear = this.#assigned && this.#value === null;
    const owner = { ...this.owner, model: this.row };
    await store.transaction(owner, async (scoped) => {
      const lifecycle = new AttachmentLifecycleService(this.#service!, scoped);
      // Create before removing: old originals/variants protect same-name replacements.
      for (const item of added) {
        const draft = item.draft()!;
        draft.metadata = structuredClone(item.meta);
        await lifecycle.add(owner, draft, undefined, this.definition.options);
      }
      if (clear) await lifecycle.clearCollection(owner);
      else
        for (const item of removed)
          await lifecycle.removeCollectionItem(owner, item.id);
      for (const item of values.filter((value) =>
        this.#baseline.includes(value),
      )) {
        for (const value of [item, ...item.variants]) {
          if (value.hasMetadataChanges) {
            const original = value.file();
            await scoped.patchMetadata(original, original.metadata, value.meta);
          }
        }
      }
    });
  }
  #store(bindModel = true): LucidJsonAttachmentStore {
    return new LucidJsonAttachmentStore({
      client: this.Model.$adapter.modelClient(this.row),
      table: this.Model.table,
      primaryKey: this.Model.$getColumn(this.Model.primaryKey)!.columnName,
      column: this.column,
      owner: this.owner,
      kind: this.definition.kind,
      ...(bindModel ? { model: this.row } : {}),
      defaultDisk: this.#service!.getPersistenceDisk(this.definition.options),
    });
  }
}
