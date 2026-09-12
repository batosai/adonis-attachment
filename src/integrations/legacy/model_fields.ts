import type { LucidModel } from "@adonisjs/lucid/types/model";
import type { AttachmentPersistenceOptions } from "../../core/attachment_options.js";
import { AttachmentConfigurationError } from "../../errors.js";

export type LegacyFieldDefinition = {
  kind: "one" | "many";
  field: string;
  options: AttachmentPersistenceOptions<any> & {
    type?: string;
    columnName?: string;
  };
};
const definitions = new WeakMap<object, Map<string, LegacyFieldDefinition>>();
export function getLegacyAttachmentDefinitions(
  Model: object,
): readonly LegacyFieldDefinition[] {
  return [...(definitions.get(Model)?.values() ?? [])];
}
export function validateLegacyAttachmentDefinition(
  Model: LucidModel,
  definition: LegacyFieldDefinition,
): void {
  const column = jsonRelationColumn(Model, definition);
  const fields =
    definitions.get(Model) ?? new Map<string, LegacyFieldDefinition>();
  if (
    [...fields.values()].some(
      (field) => jsonRelationColumn(Model, field) === column,
    )
  ) {
    throw new AttachmentConfigurationError(
      "Two legacy attachment fields cannot manage the same JSON column",
    );
  }
}
export function registerLegacyAttachmentDefinition(
  Model: LucidModel,
  definition: LegacyFieldDefinition,
): void {
  validateLegacyAttachmentDefinition(Model, definition);
  const fields =
    definitions.get(Model) ?? new Map<string, LegacyFieldDefinition>();
  fields.set(definition.field, definition);
  definitions.set(Model, fields);
}
export function jsonRelationColumn(
  Model: LucidModel,
  definition: LegacyFieldDefinition,
): string {
  Model.boot();
  const column =
    definition.options.columnName ??
    Model.namingStrategy.columnName(Model, definition.field);
  if (
    !column ||
    Model.$hasColumn(definition.field) ||
    [...Model.$columnsDefinitions.values()].some(
      (entry) => entry.columnName === column,
    )
  ) {
    throw new AttachmentConfigurationError(
      "A JSON attachment column must not also be declared with @column",
    );
  }
  return column;
}
