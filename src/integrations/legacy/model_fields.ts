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
  if (!column) {
    throw new AttachmentConfigurationError(
      "A legacy JSON attachment requires a column name",
    );
  }
  claimGeneratedColumn(Model, definition.field, column);
  return column;
}

/**
 * A schema generator commonly declares every database column with `@column()` on a base
 * model. Legacy fields own their JSON column and deliberately hydrate it from `$extras`, so
 * the ordinary Lucid definition must not remain on the concrete model. `Model.boot()` clones
 * inherited metadata before this helper runs, leaving the generated base class untouched.
 */
function claimGeneratedColumn(Model: LucidModel, field: string, column: string): void {
  const columns = [...Model.$columnsDefinitions.entries()].filter(
    ([attribute, definition]) =>
      attribute === field || definition.columnName === column,
  );

  if (!columns.length) return;

  const generatedColumns = columns.filter(([attribute, definition]) =>
    isInheritedColumn(Model, attribute, definition.columnName),
  );

  if (generatedColumns.length !== columns.length) {
    throw new AttachmentConfigurationError(
      "A JSON attachment column must not also be declared with @column",
    );
  }

  for (const [attribute, definition] of generatedColumns) {
    if (definition.isPrimary) {
      throw new AttachmentConfigurationError(
        `A legacy JSON attachment cannot take over the primary key column "${column}"`,
      );
    }
    Model.$columnsDefinitions.delete(attribute);
    removeColumnKeys(Model, attribute, definition.columnName);
  }
}

function isInheritedColumn(Model: LucidModel, attribute: string, column: string): boolean {
  let Parent = Object.getPrototypeOf(Model) as LucidModel | undefined;
  while (Parent) {
    const definition = Parent.$columnsDefinitions?.get(attribute);
    if (definition?.columnName === column) return true;
    Parent = Object.getPrototypeOf(Parent) as LucidModel | undefined;
  }
  return false;
}

type ModelKeys = {
  attributesToColumns: { all(): Record<string, string> };
  attributesToSerialized: { all(): Record<string, string> };
  columnsToAttributes: { all(): Record<string, string> };
  columnsToSerialized: { all(): Record<string, string> };
  serializedToColumns: { all(): Record<string, string> };
  serializedToAttributes: { all(): Record<string, string> };
  columnAliasesToAttributes: { all(): Record<string, string> };
};

function removeColumnKeys(Model: LucidModel, attribute: string, column: string): void {
  const keys = (Model as unknown as { $keys: ModelKeys }).$keys;
  removeKeys(keys.attributesToColumns, (key, value) => key === attribute || value === column);
  removeKeys(keys.attributesToSerialized, (key) => key === attribute);
  removeKeys(keys.columnsToAttributes, (key, value) => key === column || value === attribute);
  removeKeys(keys.columnsToSerialized, (key) => key === column);
  removeKeys(keys.serializedToColumns, (_, value) => value === column);
  removeKeys(keys.serializedToAttributes, (_, value) => value === attribute);
  removeKeys(keys.columnAliasesToAttributes, (_, value) => value === attribute);
}

function removeKeys(
  keys: { all(): Record<string, string> },
  shouldRemove: (key: string, value: string) => boolean,
): void {
  const values = keys.all();
  for (const [key, value] of Object.entries(values)) {
    if (shouldRemove(key, value)) delete values[key];
  }
}
