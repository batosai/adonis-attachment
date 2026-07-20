/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import app from "@adonisjs/core/services/app";
import type { LucidRow } from "@adonisjs/lucid/types/model";

import type {
  Attachment,
  AttachmentDraft,
  CreateAttachmentInput,
} from "../../core/attachment.js";
import type { AttachmentPersistenceOptions } from "../../core/attachment_options.js";
import type { AttachmentService } from "../../core/attachment_service.js";
import type { AttachmentOwner } from "./attachment_owner.js";
import { AttachmentModel } from "./attachment_model.js";
import { LucidAttachmentLifecycleService } from "./lucid_attachment_lifecycle_service.js";
import { LucidAttachmentStore } from "./lucid_attachment_store.js";

type AttachmentRelationInput = CreateAttachmentInput | AttachmentDraft;

type AttachmentRelationRow = LucidRow & {
  $isPersisted: boolean;
  $primaryKeyValue: string | number | null | undefined;
  constructor: { table?: string; name: string; boot(): void };
};

type RelationKind = "one" | "many";

type RelationDefinition = {
  kind: RelationKind;
  field: string;
  options: AttachmentRelationOptions<any>;
};

export type AttachmentRelationOptions<Model = any> =
  AttachmentPersistenceOptions<Model> & {
    type?: string;
  };

const relationDefinitions = new WeakMap<
  object,
  Map<string, RelationDefinition>
>();
const relationInstances = new WeakMap<
  object,
  Map<string, AttachmentRelation | AttachmentCollectionRelation>
>();

/**
 * Declares one attachment persisted in the polymorphic attachments table.
 */
export function attachmentRelation<Model = LucidRow>(
  options: AttachmentRelationOptions<Model> = {},
): PropertyDecorator {
  return defineRelation("one", options);
}

/**
 * Declares an ordered attachment collection persisted in the polymorphic attachments table.
 */
export function attachmentsRelation<Model = LucidRow>(
  options: AttachmentRelationOptions<Model> = {},
): PropertyDecorator {
  return defineRelation("many", options);
}

export class AttachmentRelation {
  readonly #row: AttachmentRelationRow;
  readonly #definition: RelationDefinition;

  constructor(row: AttachmentRelationRow, definition: RelationDefinition) {
    this.#row = row;
    this.#definition = definition;
  }

  async get(): Promise<AttachmentModel | null> {
    const lifecycle = await this.#lifecycle();
    return lifecycle.get(this.#owner());
  }

  async attach(input: AttachmentRelationInput): Promise<AttachmentModel> {
    const owner = this.#owner();
    const lifecycle = await this.#lifecycle();

    if (await lifecycle.get(owner)) {
      throw new Error(
        `Attachment relation "${owner.field}" already has an attachment; use replace() or set()`,
      );
    }

    return lifecycle.attach(owner, input, this.#definition.options);
  }

  set(input: AttachmentRelationInput): Promise<AttachmentModel> {
    return this.replace(input);
  }

  async replace(input: AttachmentRelationInput): Promise<AttachmentModel> {
    const lifecycle = await this.#lifecycle();
    return lifecycle.replace(this.#owner(), input, this.#definition.options);
  }

  async detach(): Promise<void> {
    const lifecycle = await this.#lifecycle();
    await lifecycle.detach(this.#owner());
  }

  async variants(): Promise<AttachmentModel[]> {
    const lifecycle = await this.#lifecycle();
    return lifecycle.listVariants(this.#owner());
  }

  async regenerateVariants(variantKeys?: readonly string[]): Promise<boolean> {
    const attachment = await this.get();

    if (!attachment) {
      return false;
    }

    const service = await resolveAttachmentService();
    await service.scheduleVariantGeneration(
      attachment.toAttachment(),
      variantKeys,
    );
    return true;
  }

  async #lifecycle(): Promise<LucidAttachmentLifecycleService> {
    return new LucidAttachmentLifecycleService(
      await resolveAttachmentService(),
      new LucidAttachmentStore(),
    );
  }

  #owner(): AttachmentOwner<AttachmentRelationRow> {
    return createOwner(this.#row, this.#definition);
  }
}

export class AttachmentCollectionRelation {
  readonly #row: AttachmentRelationRow;
  readonly #definition: RelationDefinition;

  constructor(row: AttachmentRelationRow, definition: RelationDefinition) {
    this.#row = row;
    this.#definition = definition;
  }

  async all(): Promise<AttachmentModel[]> {
    const lifecycle = await this.#lifecycle();
    return lifecycle.listCollection(this.#owner());
  }

  async add(
    input: AttachmentRelationInput,
    position?: number,
  ): Promise<AttachmentModel> {
    const lifecycle = await this.#lifecycle();
    return lifecycle.add(
      this.#owner(),
      input,
      position,
      this.#definition.options,
    );
  }

  async remove(id: string): Promise<boolean> {
    const lifecycle = await this.#lifecycle();
    return lifecycle.removeCollectionItem(this.#owner(), id);
  }

  async clear(): Promise<void> {
    const lifecycle = await this.#lifecycle();
    await lifecycle.clearCollection(this.#owner());
  }

  async replaceAll(
    inputs: readonly AttachmentRelationInput[],
  ): Promise<AttachmentModel[]> {
    const lifecycle = await this.#lifecycle();
    return lifecycle.replaceCollection(
      this.#owner(),
      inputs,
      this.#definition.options,
    );
  }

  async move(id: string, position: number): Promise<AttachmentModel[]> {
    const lifecycle = await this.#lifecycle();
    return lifecycle.moveCollectionItem(this.#owner(), id, position);
  }

  async #lifecycle(): Promise<LucidAttachmentLifecycleService> {
    return new LucidAttachmentLifecycleService(
      await resolveAttachmentService(),
      new LucidAttachmentStore(),
    );
  }

  #owner(): AttachmentOwner<AttachmentRelationRow> {
    return createOwner(this.#row, this.#definition);
  }
}

function defineRelation<Model>(
  kind: RelationKind,
  options: AttachmentRelationOptions<Model>,
): PropertyDecorator {
  return (target, propertyKey) => {
    const Model =
      target.constructor as unknown as AttachmentRelationRow["constructor"];
    const field = String(propertyKey);
    const definitions =
      relationDefinitions.get(Model) ?? new Map<string, RelationDefinition>();

    if (definitions.has(field)) {
      throw new Error(
        `Attachment relation "${field}" is already declared on this model`,
      );
    }

    Model.boot();
    definitions.set(field, { kind, field, options });
    relationDefinitions.set(Model, definitions);

    Object.defineProperty(target, propertyKey, {
      configurable: true,
      enumerable: false,
      get(this: AttachmentRelationRow) {
        const instances = relationInstances.get(this) ?? new Map();
        const existing = instances.get(field);

        if (existing) {
          return existing;
        }

        const relation =
          kind === "one"
            ? new AttachmentRelation(this, definitions.get(field)!)
            : new AttachmentCollectionRelation(this, definitions.get(field)!);

        instances.set(field, relation);
        relationInstances.set(this, instances);
        return relation;
      },
    });
  };
}

function createOwner(
  row: AttachmentRelationRow,
  definition: RelationDefinition,
): AttachmentOwner<AttachmentRelationRow> {
  if (
    !row.$isPersisted ||
    row.$primaryKeyValue === null ||
    row.$primaryKeyValue === undefined
  ) {
    throw new Error("Attachment relations require a persisted Lucid model");
  }

  const type = definition.options.type ?? row.constructor.table;

  if (!type) {
    throw new Error(
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

async function resolveAttachmentService(): Promise<AttachmentService> {
  return (await app.container.make("jrmc.attachment")) as AttachmentService;
}
