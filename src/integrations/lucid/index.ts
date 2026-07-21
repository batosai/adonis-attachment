/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export { AttachmentModel } from "./models/attachment_model.js";
export { AttachmentLinkModel } from "./models/attachment_link_model.js";
export {
  configureLucidAttachmentTables,
} from "./schema/configure_lucid_attachment_tables.js";
export {
  resolveAttachmentTableNames,
  type AttachmentTableNames,
} from "./schema/attachment_table_names.js";
export {
  AttachmentSchemaService,
  type AttachmentSchemaServiceOptions,
} from "./schema/attachment_schema_service.js";
export {
  attachment,
  type LucidAttachmentOptions,
} from "./column/attachment_column.js";
export {
  attachmentRelation,
  attachmentsRelation,
  AttachmentRelation,
  AttachmentCollectionRelation,
  type AttachmentRelationOptions,
} from "./relations/attachment_relation.js";
export { LucidAttachmentRepository } from "./persistence/lucid_attachment_repository.js";
export {
  LucidAttachmentStore,
  type LucidAttachmentWithVariants,
  type LucidAttachmentStoreOptions,
} from "./persistence/lucid_attachment_store.js";
export {
  LucidAttachmentLifecycleService,
  type AttachmentFileService,
  type LucidAttachmentPersistence,
} from "./persistence/lucid_attachment_lifecycle_service.js";
export {
  LucidVariantGenerationService,
  PersistedAttachmentNotFoundError,
  type LucidVariantGenerationServiceOptions,
} from "./persistence/lucid_variant_generation_service.js";
export {
  createAttachmentOwnerKey,
  type AttachmentOwner,
} from "./relations/attachment_owner.js";
export {
  createAttachmentsTableStubState,
  type AttachmentsTableStubOptions,
  type AttachmentsTableStubState,
} from "./schema/attachments_table_stub.js";
export {
  migrateLegacyAttachment,
  migrateLegacyAttachmentColumn,
  type LegacyAttachment,
  type LegacyVariant,
  type MigrateLegacyAttachmentOptions,
  type MigrateLegacyAttachmentColumnOptions,
  type MigratedAttachmentBlob,
  type MigratedAttachmentLink,
  type MigratedAttachmentRows,
} from "./migrations/legacy/migrate_legacy_attachment.js";
export {
  migrateLegacyAttachmentRecords,
  type LegacyAttachmentMigrationRecord,
  type LegacyAttachmentMigrationResult,
  type LegacyAttachmentMigrationWriter,
  type MigrateLegacyAttachmentRecordsOptions,
} from "./migrations/legacy/migrate_legacy_attachment_records.js";
export {
  createLegacyAttachmentMigrationScript,
  type CreateLegacyAttachmentMigrationScriptOptions,
} from "./migrations/legacy/create_legacy_attachment_migration_script.js";
export {
  renderLegacyAttachmentMigrationScript,
  type RenderLegacyAttachmentMigrationScriptOptions,
} from "./migrations/legacy/render_legacy_attachment_migration_script.js";
