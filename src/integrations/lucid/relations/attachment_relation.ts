/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import app from "@adonisjs/core/services/app";
import type { LucidRow, LucidModel } from "@adonisjs/lucid/types/model";
import { afterAttachmentRollback } from "../persistence/attachment_transaction.js";
import type { AttachmentLifecycleService } from "../../../core/attachment_lifecycle_service.js";
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

import { registerAttachmentModelField, withModelTransaction } from "../model/attachment_model_hooks.js";

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

export type AttachmentRelationEntry = AttachmentLinkModel;
export type AttachmentRelationRecord = AttachmentModel;

export type AttachmentRelationKind = "one" | "many";

export type AttachmentRelationDefinition = {
  kind: AttachmentRelationKind;
  field: string;
  options: AttachmentRelationOptions<any>;
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
  };

const relationDefinitions = new WeakMap<
  object,
  Map<string, RelationDefinition>
>();
/** Returns the attachment relation declarations registered on a Lucid model. */
export function getAttachmentRelationDefinitions(
  Model: object,
): readonly AttachmentRelationDefinition[] {
  return [...(relationDefinitions.get(Model)?.values() ?? [])];
}

/**
 * Declares one attachment, using the attachment and link tables.
 */
export function attachmentRelation<Model = LucidRow>(
  options: AttachmentRelationOptions<Model> = {},
): PropertyDecorator {
  return defineRelation("one", options);
}

/**
 * Declares an ordered collection, using the attachment and link tables.
 */
export function attachmentsRelation<Model = LucidRow>(
  options: AttachmentRelationOptions<Model> = {},
): PropertyDecorator {
  return defineRelation("many", options);
}

export class AttachmentRelation {
  readonly #row: AttachmentRelationRow;
  readonly #definition: RelationDefinition;
  #pending: PendingSingularOperation | undefined;

  constructor(row: AttachmentRelationRow, definition: RelationDefinition) {
    this.#row = row;
    this.#definition = definition;
  }

  async get(): Promise<AttachmentRelationEntry | null> {
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

  async persist(): Promise<AttachmentRelationEntry | null> {
    if (!this.#pending) return this.get();
    this.#owner();
    return withModelTransaction(this.#row, () => this.#persist());
  }

  async #persist(): Promise<AttachmentRelationEntry | null> {
    const pending = this.#pending;

    if (!pending) {
      return this.get();
    }

    const owner = this.#owner();
    const lifecycle = await this.#lifecycle();
    let result: AttachmentRelationEntry | null;

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

  async variants(): Promise<AttachmentRelationRecord[]> {
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

  async #lifecycle(): Promise<AttachmentLifecycleService<AttachmentRelationEntry, AttachmentRelationRecord>> {
    return createLifecycle(this.#row, this.#definition) as Promise<AttachmentLifecycleService<AttachmentRelationEntry, AttachmentRelationRecord>>;
  }

  #owner(): AttachmentOwner<AttachmentRelationRow> {
    return createOwner(this.#row, this.#definition);
  }

  async #preComputeUrl(link: AttachmentRelationEntry | null): Promise<AttachmentRelationEntry | null> {
    if (!link) {
      return null;
    }

    const service = await resolveAttachmentService();
    if (service.getPreComputeUrlEnabled(this.#definition.options)) {
      link.attachment.url = (await service.preComputeUrl(link.toAttachment())).url;
    }
    return link;
  }

  async #preComputeVariantUrls(variants: AttachmentRelationRecord[]): Promise<AttachmentRelationRecord[]> {
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

export class AttachmentCollectionRelation {
  readonly #row: AttachmentRelationRow;
  readonly #definition: RelationDefinition;
  #pending: PendingCollectionOperation[] = [];

  constructor(row: AttachmentRelationRow, definition: RelationDefinition) {
    this.#row = row;
    this.#definition = definition;
  }

  async all(): Promise<AttachmentRelationEntry[]> {
    const lifecycle = await this.#lifecycle();
    const links = await lifecycle.listCollection(this.#owner());
    const service = await resolveAttachmentService();
    if (!service.getPreComputeUrlEnabled(this.#definition.options)) {
      return links;
    }

    await Promise.all(links.map(async (link) => {
      link.attachment.url = (await service.preComputeUrl(link.toAttachment())).url;
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

  async persist(): Promise<AttachmentRelationEntry[]> {
    if (!this.hasPending) return this.all();
    this.#owner();
    return withModelTransaction(this.#row, () => this.#persist());
  }

  async #persist(): Promise<AttachmentRelationEntry[]> {
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

  async #lifecycle(): Promise<AttachmentLifecycleService<AttachmentRelationEntry, AttachmentRelationRecord>> {
    return createLifecycle(this.#row, this.#definition) as Promise<AttachmentLifecycleService<AttachmentRelationEntry, AttachmentRelationRecord>>;
  }

  #owner(): AttachmentOwner<AttachmentRelationRow> {
    return createOwner(this.#row, this.#definition);
  }
}

function defineRelation<Model>(
  kind: AttachmentRelationKind,
  options: AttachmentRelationOptions<Model>,
): PropertyDecorator {
  return (target, propertyKey) => {
    const Model = target.constructor as unknown as LucidModel;
    const field = String(propertyKey);
    Model.boot();
    if ("persistence" in options || "columnName" in options) {
      throw new AttachmentConfigurationError("Lucid attachment relations use tables; JSON fields must use /legacy");
    }
    const definition = { kind, field, options: { ...options } };
    const instance: (row: LucidRow) => AttachmentRelation | AttachmentCollectionRelation = registerAttachmentModelField(Model, {
      field,
      create: (row) => kind === "one"
        ? new AttachmentRelation(row as AttachmentRelationRow, definition)
        : new AttachmentCollectionRelation(row as AttachmentRelationRow, definition),
      afterDelete: async (row) => {
        await (await createLifecycle(row as AttachmentRelationRow, definition)).purgeOwner(createOwner(row as AttachmentRelationRow, definition, true));
      },
      regenerate: async (row, keys) => {
        const result = await instance(row).regenerateVariants(keys);
        return typeof result === "boolean" ? Number(result) : result;
      },
    });
    const definitions = relationDefinitions.get(Model) ?? new Map<string, RelationDefinition>();
    definitions.set(field, definition);
    relationDefinitions.set(Model, definitions);
    Object.defineProperty(target, propertyKey, {
      configurable: true, enumerable: false,
      get(this: AttachmentRelationRow) { return instance(this); },
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

async function createLifecycle(row: AttachmentRelationRow, _definition: RelationDefinition) {
  return new LucidAttachmentLifecycleService(await resolveAttachmentService(), new LucidAttachmentStore(
    AttachmentModel, row.$trx ? { client: row.$trx } : {},
  ));
}

async function resolveAttachmentService(): Promise<AttachmentService> {
  return (await app.container.make("jrmc.attachment")) as AttachmentService;
}
