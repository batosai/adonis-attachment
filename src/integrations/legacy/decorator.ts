import app from "@adonisjs/core/services/app";
import type { LucidModel, LucidRow } from "@adonisjs/lucid/types/model";
import { Attachment } from "./attachment.js";
import {
  defineRelation,
  jsonRelationColumn,
  type AttachmentRelationDefinition,
  type AttachmentRelationRow,
  type AttachmentRelationOptions,
  type ManagedAttachmentField,
} from "../lucid/relations/attachment_relation.js";
import { AttachmentLifecycleService } from "../../core/attachment_lifecycle_service.js";
import type { AttachmentService } from "../../core/attachment_service.js";
import { LucidJsonAttachmentStore } from "../lucid/json/lucid_json_attachment_store.js";
import {
  attachmentFromDocument,
  decodeJsonAttachments,
  JsonAttachmentRecord,
} from "../lucid/json/json_attachment_document.js";
import { afterAttachmentRollback } from "../lucid/persistence/attachment_transaction.js";
import { AttachmentValidationError } from "../../errors.js";

// One source draft belongs to one field, including before either owner is saved.
const draftOwners = new WeakMap<object, LegacyField>();

export type AttachmentOptions<Model = LucidRow> = Omit<
  AttachmentRelationOptions<Model>,
  "persistence" | "folder" | "rename"
> & {
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
  return (target, key) => {
    const {
      folder,
      rename,
      serializeAs,
      serialize: customSerialize,
      ...rest
    } = options;
    const persistence: AttachmentRelationOptions<Model> = {
      ...rest,
      persistence: "json",
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
    defineRelation(
      "one",
      persistence,
      (row, definition) => new LegacyField(row, definition),
    )(target, key);
    const ModelClass = target.constructor as LucidModel;
    const field = String(key);
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
        const value = (this as unknown as Record<string, Attachment | null>)[
          field
        ];
        result[serialized] = customSerialize
          ? customSerialize(value ?? null, field, this as Model)
          : (value?.toJSON() ?? null);
      }
      return result;
    };
  };
}

class LegacyField implements ManagedAttachmentField {
  #service?: AttachmentService;
  #value: Attachment | null = null;
  #raw: unknown;
  #loaded = false;
  #assigned = false;
  constructor(
    readonly row: AttachmentRelationRow,
    readonly definition: AttachmentRelationDefinition,
  ) {}
  get Model() {
    return this.row.constructor as unknown as LucidModel;
  }
  get column() {
    return jsonRelationColumn(this.Model, this.definition);
  }
  get owner() {
    return {
      type: this.definition.options.type ?? this.Model.table,
      id: String(this.row.$primaryKeyValue),
      field: this.definition.field,
    };
  }
  get hasPending() {
    return this.#assigned || !!this.#value?.hasMetadataChanges;
  }
  get value(): Attachment | null {
    if (
      !this.#assigned &&
      (!this.#loaded || this.#raw !== this.row.$extras[this.column])
    )
      this.#hydrate();
    return this.#value;
  }
  assign(value: unknown): void {
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
      await this.#store().findOriginal(this.owner);
    // Partial selects are allowed, but accessing an omitted field is explicit failure.
    if (Object.hasOwn(this.row.$extras, this.column)) {
      this.#hydrate();
      if (this.#service.getPreComputeUrlEnabled(this.definition.options))
        await this.#value?.preComputeUrl();
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
    if (this.#value?.hasMetadataChanges)
      throw new AttachmentValidationError(
        "Save legacy metadata changes before refreshing the attachment snapshot",
      );
    if (raw === null || raw === undefined) {
      this.#raw = raw;
      this.#loaded = true;
      this.#value = null;
      return;
    }
    if (!this.#service)
      throw new AttachmentValidationError(
        "Legacy attachment hydration requires Lucid find/fetch hooks",
      );
    const disk = this.#service.getPersistenceDisk(this.definition.options);
    const documents = decodeJsonAttachments(raw, "one", this.owner, disk);
    if (documents.length === 0) {
      this.#raw = raw;
      this.#loaded = true;
      this.#value = null;
      return;
    }
    const document = documents[0]!;
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
    this.#value = new Attachment(
      file(document),
      this.#service,
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
    };
    afterAttachmentRollback(this.row.$trx!, () => {
      this.#value = state.value;
      this.#assigned = state.assigned;
      this.#raw = state.raw;
      this.#loaded = state.loaded;
    });
    const store = this.#store();
    if (this.#assigned) {
      const lifecycle = new AttachmentLifecycleService(this.#service, store);
      const owner = { ...this.owner, model: this.row };
      if (this.#value) {
        const draft = this.#value.draft()!;
        draft.metadata = structuredClone(this.#value.meta);
        await lifecycle.replace(owner, draft, this.definition.options);
      } else await lifecycle.detach(owner);
    } else if (this.#value) {
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
    this.#assigned = false;
    await this.initialize();
  }
  #store(): LucidJsonAttachmentStore {
    return new LucidJsonAttachmentStore({
      client: this.Model.$adapter.modelClient(this.row),
      table: this.Model.table,
      primaryKey: this.Model.$getColumn(this.Model.primaryKey)!.columnName,
      column: this.column,
      owner: this.owner,
      kind: "one",
      model: this.row,
      defaultDisk: this.#service!.getPersistenceDisk(this.definition.options),
    });
  }
}
