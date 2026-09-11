/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import app from "@adonisjs/core/services/app";
import type { LucidRow, LucidModel } from "@adonisjs/lucid/types/model";
import { attachmentTransaction, afterAttachmentRollback } from "../persistence/attachment_transaction.js";
import { AttachmentLifecycleService } from "../../../core/attachment_lifecycle_service.js";
import { LucidJsonAttachmentStore } from "../json/lucid_json_attachment_store.js";
import { JsonAttachmentEntry, JsonAttachmentRecord } from "../json/json_attachment_document.js";
import type { AttachmentVariantKey } from "../../../../index.js";

import type {
  Attachment,
  AttachmentDraft,
  CreateAttachmentInput,
} from "../../../core/attachment.js";
import type { AttachmentPersistenceOptions } from "../../../core/attachment_options.js";
import type { AttachmentService } from "../../../core/attachment_service.js";
import type { AttachmentOwner } from "./attachment_owner.js";
import { AttachmentLinkModel } from "../models/attachment_link_model.js";
import { AttachmentModel } from "../models/attachment_model.js";
import { LucidAttachmentLifecycleService } from "../persistence/lucid_attachment_lifecycle_service.js";
import { LucidAttachmentStore } from "../persistence/lucid_attachment_store.js";
import {
  AttachmentConfigurationError,
  AttachmentConflictError,
  AttachmentValidationError,
} from "../../../errors.js";

type AttachmentRelationInput = CreateAttachmentInput | AttachmentDraft;

export type AttachmentRelationRow = LucidRow & {
  $isPersisted: boolean;
  $primaryKeyValue: string | number | null | undefined;
  constructor: {
    table?: string;
    name: string;
    boot(): void;
    prototype: AttachmentRelationRow & {
      save(): Promise<unknown>;
    };
    after(
      event: "delete",
      callback: (row: AttachmentRelationRow) => void | Promise<void>,
    ): void;
  };
};

export type AttachmentPersistenceMode = "tables" | "json";
export type AttachmentRelationEntry<Mode extends AttachmentPersistenceMode = "tables"> =
  Mode extends "json" ? JsonAttachmentEntry : AttachmentLinkModel;
export type AttachmentRelationRecord<Mode extends AttachmentPersistenceMode = "tables"> =
  Mode extends "json" ? JsonAttachmentRecord : AttachmentModel;

export type AttachmentRelationKind = "one" | "many";

export type AttachmentRelationDefinition = {
  kind: AttachmentRelationKind;
  field: string;
  options: AttachmentRelationOptions<any>;
  /** Internal: direct values can be assigned inside Lucid beforeSave hooks. */
  managed?: boolean;
};

type RelationDefinition = AttachmentRelationDefinition;

type PendingSingularOperation =
  | { type: "attach"; input: AttachmentRelationInput }
  | { type: "attachExisting"; attachmentId: string }
  | { type: "replace"; input: AttachmentRelationInput }
  | { type: "detach" };

type PendingCollectionOperation =
  | { type: "add"; input: AttachmentRelationInput; position?: number }
  | { type: "addExisting"; attachmentId: string; position?: number }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "replaceAll"; inputs: readonly AttachmentRelationInput[] }
  | { type: "move"; id: string; position: number };

export type AttachmentRelationOptions<Model = any> =
  AttachmentPersistenceOptions<Model> & {
    type?: string;
    /** Defaults to the two-table store. JSON manages a column on the owner. */
    persistence?: AttachmentPersistenceMode;
    /** JSON database column name; defaults to the model naming strategy. */
    columnName?: string;
  };

const relationDefinitions = new WeakMap<
  object,
  Map<string, RelationDefinition>
>();
const relationInstances = new WeakMap<
  object,
  Map<string, { readonly hasPending: boolean; persist(): Promise<unknown> }>
>();
/** Internal extension point: legacy values share the same model transaction hooks. */
export interface ManagedAttachmentField {
  readonly hasPending: boolean;
  readonly value: unknown;
  assign(value: unknown): void;
  initialize(reload?: boolean): Promise<void>;
  persist(): Promise<unknown>;
}
const deleteHooks = new WeakSet<object>();
const saveHooks = new WeakSet<object>();

/** Returns the attachment relation declarations registered on a Lucid model. */
export function getAttachmentRelationDefinitions(
  Model: object,
): readonly AttachmentRelationDefinition[] {
  return [...(relationDefinitions.get(Model)?.values() ?? [])];
}

/**
 * Declares one attachment, using tables by default or an owner JSON column.
 */
export function attachmentRelation<Model = LucidRow>(
  options: AttachmentRelationOptions<Model> = {},
): PropertyDecorator {
  return defineRelation("one", options);
}

/**
 * Declares an ordered collection, using tables by default or an owner JSON column.
 */
export function attachmentsRelation<Model = LucidRow>(
  options: AttachmentRelationOptions<Model> = {},
): PropertyDecorator {
  return defineRelation("many", options);
}

export class AttachmentRelation<Mode extends AttachmentPersistenceMode = "tables"> {
  readonly #row: AttachmentRelationRow;
  readonly #definition: RelationDefinition;
  #pending: PendingSingularOperation | undefined;

  constructor(row: AttachmentRelationRow, definition: RelationDefinition) {
    this.#row = row;
    this.#definition = definition;
  }

  async get(): Promise<AttachmentRelationEntry<Mode> | null> {
    const lifecycle = await this.#lifecycle();
    return this.#preComputeUrl(await lifecycle.get(this.#owner()));
  }

  get hasPending(): boolean {
    return this.#pending !== undefined;
  }

  attach(input: AttachmentRelationInput): void {
    if (this.#pending && this.#pending.type !== "detach") {
      throw new AttachmentConflictError(
        `Attachment relation "${this.#definition.field}" already has a pending attachment; use replace() or set()`,
      );
    }

    this.#pending = { type: "attach", input };
  }

  attachExisting(attachmentId: string): void {
    if (this.#pending && this.#pending.type !== "detach") {
      throw new AttachmentConflictError(
        `Attachment relation "${this.#definition.field}" already has a pending attachment; use replace() or set()`,
      );
    }

    this.#pending = { type: "attachExisting", attachmentId };
  }

  set(input: AttachmentRelationInput): void {
    this.replace(input);
  }

  replace(input: AttachmentRelationInput): void {
    this.#pending = { type: "replace", input };
  }

  detach(): void {
    this.#pending = { type: "detach" };
  }

  async persist(): Promise<AttachmentRelationEntry<Mode> | null> {
    if (!this.#pending) return this.get();
    this.#owner();
    return withModelTransaction(this.#row, () => this.#persist());
  }

  async #persist(): Promise<AttachmentRelationEntry<Mode> | null> {
    const pending = this.#pending;

    if (!pending) {
      return this.get();
    }

    const owner = this.#owner();
    const lifecycle = await this.#lifecycle();
    let result: AttachmentRelationEntry<Mode> | null;

    switch (pending.type) {
      case "attach":
        if (await lifecycle.get(owner)) {
          throw new AttachmentConflictError(
            `Attachment relation "${owner.field}" already has an attachment; use replace() or set()`,
          );
        }
        result = await lifecycle.attach(owner, pending.input, this.#definition.options);
        break;
      case "attachExisting":
        if (await lifecycle.get(owner)) {
          throw new AttachmentConflictError(
            `Attachment relation "${owner.field}" already has an attachment; use replace() or set()`,
          );
        }
        result = await lifecycle.attachExisting(owner, pending.attachmentId);
        break;
      case "replace":
        result = await lifecycle.replace(owner, pending.input, this.#definition.options);
        break;
      case "detach":
        await lifecycle.detach(owner);
        result = null;
        break;
    }

    this.#pending = undefined;
    afterAttachmentRollback(this.#row.$trx!, () => { this.#pending ??= pending; });
    return result;
  }

  async variants(): Promise<AttachmentRelationRecord<Mode>[]> {
    const lifecycle = await this.#lifecycle();
    return this.#preComputeVariantUrls(await lifecycle.listVariants(this.#owner()));
  }

  async regenerateVariants(variantKeys?: readonly AttachmentVariantKey[]): Promise<boolean> {
    const attachment = await this.get();

    if (!attachment) {
      return false;
    }

    const service = await resolveAttachmentService();
    await service.scheduleVariantGeneration(
      attachment.toAttachment(),
      variantKeys,
      service.getVariantMetadataEnabled(undefined, this.#definition.options),
      undefined,
      'replace',
    );
    return true;
  }

  async #lifecycle(): Promise<AttachmentLifecycleService<AttachmentRelationEntry<Mode>, AttachmentRelationRecord<Mode>>> {
    // The decorator selects the implementation; the generic preserves table-model
    // return types for existing consumers and exposes detached records for JSON.
    return createLifecycle(this.#row, this.#definition) as Promise<AttachmentLifecycleService<AttachmentRelationEntry<Mode>, AttachmentRelationRecord<Mode>>>;
  }

  #owner(): AttachmentOwner<AttachmentRelationRow> {
    return createOwner(this.#row, this.#definition);
  }

  async #preComputeUrl(link: AttachmentRelationEntry<Mode> | null): Promise<AttachmentRelationEntry<Mode> | null> {
    if (!link) {
      return null;
    }

    const service = await resolveAttachmentService();
    if (service.getPreComputeUrlEnabled(this.#definition.options)) {
      (link instanceof JsonAttachmentRecord ? link : link.attachment).url = (await service.preComputeUrl(link.toAttachment())).url;
    }
    return link;
  }

  async #preComputeVariantUrls(variants: AttachmentRelationRecord<Mode>[]): Promise<AttachmentRelationRecord<Mode>[]> {
    const service = await resolveAttachmentService();
    if (!service.getPreComputeUrlEnabled(this.#definition.options)) {
      return variants;
    }

    await Promise.all(variants.map(async (variant) => {
      variant.url = (await service.preComputeUrl(variant.toAttachment())).url;
    }));
    return variants;
  }
}

export class AttachmentCollectionRelation<Mode extends AttachmentPersistenceMode = "tables"> {
  readonly #row: AttachmentRelationRow;
  readonly #definition: RelationDefinition;
  #pending: PendingCollectionOperation[] = [];

  constructor(row: AttachmentRelationRow, definition: RelationDefinition) {
    this.#row = row;
    this.#definition = definition;
  }

  async all(): Promise<AttachmentRelationEntry<Mode>[]> {
    const lifecycle = await this.#lifecycle();
    const links = await lifecycle.listCollection(this.#owner());
    const service = await resolveAttachmentService();
    if (!service.getPreComputeUrlEnabled(this.#definition.options)) {
      return links;
    }

    await Promise.all(links.map(async (link) => {
      (link instanceof JsonAttachmentRecord ? link : link.attachment).url = (await service.preComputeUrl(link.toAttachment())).url;
    }));
    return links;
  }

  /** Enqueues replacement generation for every original in this collection. */
  async regenerateVariants(variantKeys?: readonly AttachmentVariantKey[]): Promise<number> {
    const lifecycle = await this.#lifecycle();
    const attachments = await lifecycle.listCollection(this.#owner());
    const service = await resolveAttachmentService();

    await Promise.all(attachments.map((attachment) =>
      service.scheduleVariantGeneration(
        attachment.toAttachment(),
        variantKeys,
        service.getVariantMetadataEnabled(undefined, this.#definition.options),
        undefined,
        'replace',
      )
    ));

    return attachments.length;
  }

  get hasPending(): boolean {
    return this.#pending.length > 0;
  }

  add(
    input: AttachmentRelationInput,
    position?: number,
  ): void {
    this.#pending.push({ type: "add", input, ...(position !== undefined ? { position } : {}) });
  }

  /** Stages several attachments while retaining their input order. */
  addMany(
    inputs: readonly AttachmentRelationInput[],
    position?: number,
  ): void {
    inputs.forEach((input, index) => {
      this.add(input, position === undefined ? undefined : position + index);
    });
  }

  addExisting(
    attachmentId: string,
    position?: number,
  ): void {
    this.#pending.push({
      type: "addExisting",
      attachmentId,
      ...(position !== undefined ? { position } : {}),
    });
  }

  remove(id: string): void {
    this.#pending.push({ type: "remove", id });
  }

  clear(): void {
    this.#pending = [{ type: "clear" }];
  }

  replaceAll(
    inputs: readonly AttachmentRelationInput[],
  ): void {
    this.#pending = [{ type: "replaceAll", inputs }];
  }

  move(id: string, position: number): void {
    this.#pending.push({ type: "move", id, position });
  }

  async persist(): Promise<AttachmentRelationEntry<Mode>[]> {
    if (!this.hasPending) return this.all();
    this.#owner();
    return withModelTransaction(this.#row, () => this.#persist());
  }

  async #persist(): Promise<AttachmentRelationEntry<Mode>[]> {
    if (this.#pending.length === 0) {
      return this.all();
    }

    const lifecycle = await this.#lifecycle();
    const owner = this.#owner();

    const pending = [...this.#pending];
    afterAttachmentRollback(this.#row.$trx!, () => { this.#pending = pending; });

    return lifecycle.transaction(owner, async (lifecycle) => {
      while (this.#pending.length > 0) {
        const operation = this.#pending[0]!;

        switch (operation.type) {
          case "add":
            await lifecycle.add(owner, operation.input, operation.position, this.#definition.options);
            break;
          case "addExisting":
            await lifecycle.addExisting(owner, operation.attachmentId, operation.position);
            break;
          case "remove":
            await lifecycle.removeCollectionItem(owner, operation.id);
            break;
          case "clear":
            await lifecycle.clearCollection(owner);
            break;
          case "replaceAll":
            await lifecycle.replaceCollection(owner, operation.inputs, this.#definition.options);
            break;
          case "move":
            await lifecycle.moveCollectionItem(owner, operation.id, operation.position);
            break;
        }

        this.#pending.shift();
      }
      return lifecycle.listCollection(owner);
    });
  }

  async #lifecycle(): Promise<AttachmentLifecycleService<AttachmentRelationEntry<Mode>, AttachmentRelationRecord<Mode>>> {
    // The decorator selects the implementation; the generic preserves table-model
    // return types for existing consumers and exposes detached records for JSON.
    return createLifecycle(this.#row, this.#definition) as Promise<AttachmentLifecycleService<AttachmentRelationEntry<Mode>, AttachmentRelationRecord<Mode>>>;
  }

  #owner(): AttachmentOwner<AttachmentRelationRow> {
    return createOwner(this.#row, this.#definition);
  }
}

export function defineRelation<Model>(
  kind: AttachmentRelationKind,
  options: AttachmentRelationOptions<Model>,
  managed?: (row: AttachmentRelationRow, definition: RelationDefinition) => ManagedAttachmentField,
): PropertyDecorator {
  return (target, propertyKey) => {
    const Model =
      target.constructor as unknown as AttachmentRelationRow["constructor"];
    const field = String(propertyKey);
    const definitions =
      relationDefinitions.get(Model) ?? new Map<string, RelationDefinition>();

    if (definitions.has(field)) {
      throw new AttachmentConfigurationError(
        `Attachment relation "${field}" is already declared on this model`,
      );
    }

    Model.boot();
    if (options.persistence !== undefined && !["tables", "json"].includes(options.persistence)) {
      throw new AttachmentConfigurationError("Unknown attachment persistence mode");
    }
    if (options.columnName !== undefined && options.persistence !== "json") {
      throw new AttachmentConfigurationError("columnName is only supported by JSON attachment relations");
    }
    if (options.persistence === "json") {
      const column = jsonRelationColumn(Model as unknown as LucidModel, { kind, field, options });
      if ([...definitions.values()].some((definition) =>
        definition.options.persistence === "json" &&
        jsonRelationColumn(Model as unknown as LucidModel, definition) === column
      )) throw new AttachmentConfigurationError("Two attachment relations cannot manage the same JSON column");
    }
    definitions.set(field, { kind, field, options: { ...options }, ...(managed ? { managed: true } : {}) });
    relationDefinitions.set(Model, definitions);

    if (!deleteHooks.has(Model)) {
      deleteHooks.add(Model);
      const deleteRow = Model.prototype.delete;
      Model.prototype.delete = async function(this: AttachmentRelationRow) {
        return withModelTransaction(this, async () => {
          // JSON disappears with the owner row: collect files before deleting it.
          for (const definition of relationDefinitions.get(Model)?.values() ?? []) {
            if (definition.options.persistence !== "json") continue;
            await (await createLifecycle(this, definition)).purgeOwner(createOwner(this, definition));
          }
          return deleteRow.call(this);
        });
      };
      Model.after("delete", async (row) => {
        for (const definition of relationDefinitions.get(Model)?.values() ?? []) {
          if (definition.options.persistence === "json") continue;
          const lifecycle = new LucidAttachmentLifecycleService(
            await resolveAttachmentService(),
            new LucidAttachmentStore(
              AttachmentModel,
              row.$trx ? { client: row.$trx } : {},
            ),
          );
          await lifecycle.purgeOwner(createOwner(row, definition, true));
        }
      });
    }

    if (!saveHooks.has(Model)) {
      saveHooks.add(Model);
      wrapSave(Model);
    }

    const instance = (row: AttachmentRelationRow) => {
      const instances = relationInstances.get(row) ?? new Map();
      let relation = instances.get(field);
      if (!relation) {
        relation = managed ? managed(row, definitions.get(field)!) : kind === "one"
          ? new AttachmentRelation<AttachmentPersistenceMode>(row, definitions.get(field)!)
          : new AttachmentCollectionRelation<AttachmentPersistenceMode>(row, definitions.get(field)!);
        instances.set(field, relation);
        relationInstances.set(row, instances);
      }
      return relation;
    };
    if (managed) {
      const lucidModel = Model as unknown as LucidModel;
      lucidModel.before("create", (row) => {
        const fieldInstance = instance(row as AttachmentRelationRow) as ManagedAttachmentField;
        // A new owner without a draft has an empty field, not an omitted SELECT column.
        if (!fieldInstance.hasPending) void fieldInstance.value;
      });
      lucidModel.after("find", async (row) => { await (instance(row as AttachmentRelationRow) as ManagedAttachmentField).initialize(); });
      lucidModel.after("fetch", async (rows) => {
        await Promise.all(rows.map((row) => (instance(row as AttachmentRelationRow) as ManagedAttachmentField).initialize()));
      });
      const refresh = lucidModel.prototype.refresh;
      lucidModel.prototype.refresh = async function() {
        const fieldInstance = instance(this as AttachmentRelationRow) as ManagedAttachmentField;
        if (fieldInstance.hasPending) throw new AttachmentValidationError("Save pending legacy attachment changes before refresh()");
        await refresh.call(this);
        await fieldInstance.initialize(true);
        return this;
      };
    }
    Object.defineProperty(target, propertyKey, {
      configurable: true,
      enumerable: false,
      get(this: AttachmentRelationRow) {
        const relation = instance(this);
        return managed ? (relation as ManagedAttachmentField).value : relation;
      },
      ...(managed ? { set(this: AttachmentRelationRow, value: unknown) {
        (instance(this) as ManagedAttachmentField).assign(value);
      } } : {}),
    });
  };
}

function createOwner(
  row: AttachmentRelationRow,
  definition: RelationDefinition,
  allowDeleted = false,
): AttachmentOwner<AttachmentRelationRow> {
  if (
    (!allowDeleted && !row.$isPersisted) ||
    row.$primaryKeyValue === null ||
    row.$primaryKeyValue === undefined
  ) {
    throw new AttachmentValidationError("Attachment relations require a persisted Lucid model");
  }

  const type = definition.options.type ?? row.constructor.table;

  if (!type) {
    throw new AttachmentConfigurationError(
      "Attachment relations require a Lucid model table or an explicit relation type",
    );
  }

  return {
    type,
    id: String(row.$primaryKeyValue),
    field: definition.field,
    model: row,
  };
}

/** Internal trusted mapping shared by decorators and the worker model allowlist. */
export function jsonRelationColumn(Model: LucidModel, definition: RelationDefinition): string {
  Model.boot();
  const column = definition.options.columnName ?? Model.namingStrategy.columnName(Model, definition.field);
  if (!column || Model.$hasColumn(definition.field) || [...Model.$columnsDefinitions.values()].some((entry) => entry.columnName === column)) {
    throw new AttachmentConfigurationError("A JSON attachment column must not also be declared with @column");
  }
  return column;
}

async function createLifecycle(row: AttachmentRelationRow, definition: RelationDefinition) {
  const service = await resolveAttachmentService();
  if (definition.options.persistence === "json") {
    const Model = row.constructor as unknown as LucidModel;
    const owner = createOwner(row, definition);
    return new AttachmentLifecycleService(service, new LucidJsonAttachmentStore({
      client: Model.$adapter.modelClient(row), table: Model.table,
      primaryKey: Model.$getColumn(Model.primaryKey)!.columnName,
      column: jsonRelationColumn(Model, definition),
      owner: { type: owner.type, id: owner.id, field: owner.field },
      kind: definition.kind, defaultDisk: service.getPersistenceDisk(definition.options), model: row,
    }));
  }
  return new LucidAttachmentLifecycleService(service, new LucidAttachmentStore(
    AttachmentModel, row.$trx ? { client: row.$trx } : {},
  ));
}

async function resolveAttachmentService(): Promise<AttachmentService> {
  return (await app.container.make("jrmc.attachment")) as AttachmentService;
}

function wrapSave(Model: AttachmentRelationRow["constructor"]): void {
  const save = Model.prototype.save;

  Model.prototype.save = (async function saveWithAttachmentRelations(this: AttachmentRelationRow) {
    const persist = async () => {
      for (const definition of relationDefinitions.get(Model)?.values() ?? []) {
        if (definition.options.persistence === "json") jsonRelationColumn(Model as unknown as LucidModel, definition);
      }
      const result = await save.call(this);

      for (const relation of relationInstances.get(this)?.values() ?? []) {
        if (relation.hasPending) {
          await relation.persist();
        }
      }

      return result;
    };
    if (![...(relationDefinitions.get(Model)?.values() ?? [])].some((definition) => definition.managed) &&
      ![...(relationInstances.get(this)?.values() ?? [])].some((relation) => relation.hasPending)) {
      return persist();
    }
    return withModelTransaction(this, persist);
  }) as typeof Model.prototype.save;
}

async function withModelTransaction<T>(row: AttachmentRelationRow, callback: () => Promise<T>): Promise<T> {
  const Model = row.constructor as unknown as LucidModel;
  const parent = row.$trx;
  const state = {
    attributes: { ...row.$attributes }, original: { ...row.$original },
    persisted: row.$isPersisted, local: row.$isLocal, deleted: row.$isDeleted,
  };
  try {
    return await attachmentTransaction(Model.$adapter.modelClient(row), async (transaction) => {
      row.useTransaction(transaction);
      afterAttachmentRollback(transaction, () => {
        row.$attributes = state.attributes;
        row.$original = state.original;
        row.$isPersisted = state.persisted;
        row.$isLocal = state.local;
        row.$isDeleted = state.deleted;
      });
      return callback();
    });
  } finally {
    if (parent) row.useTransaction(parent);
  }
}
