import type { LucidModel, LucidRow } from "@adonisjs/lucid/types/model";
import type { AttachmentVariantKey } from "../../../../index.js";
import { AttachmentConfigurationError } from "../../../errors.js";
import {
  attachmentTransaction,
  afterAttachmentRollback,
} from "../persistence/attachment_transaction.js";

/** Shared coordination only: each field integration owns its data and lifecycle. */
export type AttachmentModelField = {
  field: string;
  transactionalSave?: boolean;
  validate?(): void;
  create(row: LucidRow): {
    readonly hasPending: boolean;
    persist(): Promise<unknown>;
  };
  beforeDelete?(row: LucidRow): Promise<void>;
  afterDelete?(row: LucidRow): Promise<void>;
  regenerate(
    row: LucidRow,
    keys?: readonly AttachmentVariantKey[],
  ): Promise<number>;
};

const definitions = new WeakMap<object, Map<string, AttachmentModelField>>();
const instances = new WeakMap<
  object,
  Map<string, ReturnType<AttachmentModelField["create"]>>
>();

export function getAttachmentModelFields(
  Model: object,
): readonly AttachmentModelField[] {
  return [...(definitions.get(Model)?.values() ?? [])];
}

export function registerAttachmentModelField<
  T extends ReturnType<AttachmentModelField["create"]>,
>(
  Model: LucidModel,
  definition: Omit<AttachmentModelField, "create"> & {
    create(row: LucidRow): T;
  },
): (row: LucidRow) => T {
  Model.boot();
  let fields = definitions.get(Model);
  if (!fields) {
    fields = new Map();
    definitions.set(Model, fields);
    wrapModel(Model);
  }
  if (fields.has(definition.field))
    throw new AttachmentConfigurationError(
      `Attachment field "${definition.field}" is already declared on this model`,
    );
  fields.set(definition.field, definition);
  return (row) => {
    const values = instances.get(row) ?? new Map();
    if (!values.has(definition.field)) {
      values.set(definition.field, definition.create(row));
      instances.set(row, values);
    }
    return values.get(definition.field) as T;
  };
}

function wrapModel(Model: LucidModel): void {
  const save = Model.prototype.save;
  Model.prototype.save = async function () {
    const persist = async () => {
      for (const field of getAttachmentModelFields(Model)) field.validate?.();
      const result = await save.call(this);
      for (const instance of instances.get(this)?.values() ?? []) {
        if (instance.hasPending) await instance.persist();
      }
      return result;
    };
    const transactional =
      getAttachmentModelFields(Model).some(
        (field) => field.transactionalSave,
      ) ||
      [...(instances.get(this)?.values() ?? [])].some(
        (instance) => instance.hasPending,
      );
    return transactional ? withModelTransaction(this, persist) : persist();
  };
  const remove = Model.prototype.delete;
  Model.prototype.delete = async function () {
    return withModelTransaction(this, async () => {
      for (const field of getAttachmentModelFields(Model))
        await field.beforeDelete?.(this);
      return remove.call(this);
    });
  };
  Model.after("delete", async (row) => {
    for (const field of getAttachmentModelFields(Model))
      await field.afterDelete?.(row);
  });
}

export async function withModelTransaction<T>(
  row: LucidRow,
  callback: () => Promise<T>,
): Promise<T> {
  const Model = row.constructor as LucidModel;
  const parent = row.$trx;
  const state = {
    attributes: { ...row.$attributes },
    original: { ...row.$original },
    persisted: row.$isPersisted,
    local: row.$isLocal,
    deleted: row.$isDeleted,
  };
  try {
    return await attachmentTransaction(
      Model.$adapter.modelClient(row),
      async (transaction) => {
        row.useTransaction(transaction);
        afterAttachmentRollback(transaction, () => {
          row.$attributes = state.attributes;
          row.$original = state.original;
          row.$isPersisted = state.persisted;
          row.$isLocal = state.local;
          row.$isDeleted = state.deleted;
        });
        return callback();
      },
    );
  } finally {
    if (parent) row.useTransaction(parent);
  }
}
