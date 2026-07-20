/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export { AttachmentModel } from "./attachment_model.js";
export {
  attachment,
  type LucidAttachmentOptions,
} from "./attachment_column.js";
export { LucidAttachmentRepository } from "./lucid_attachment_repository.js";
export {
  LucidAttachmentStore,
  type LucidAttachmentWithVariants,
} from "./lucid_attachment_store.js";
export {
  LucidAttachmentLifecycleService,
  type AttachmentFileService,
  type LucidAttachmentPersistence,
} from "./lucid_attachment_lifecycle_service.js";
export {
  LucidVariantGenerationService,
  PersistedAttachmentNotFoundError,
  type LucidVariantGenerationServiceOptions,
} from "./lucid_variant_generation_service.js";
export {
  createAttachmentOwnerKey,
  type AttachmentOwner,
} from "./attachment_owner.js";
export {
  createAttachmentsTableStubState,
  type AttachmentsTableStubOptions,
  type AttachmentsTableStubState,
} from "./attachments_table_stub.js";
export {
  migrateLegacyAttachment,
  migrateLegacyAttachmentColumn,
  type LegacyAttachment,
  type LegacyVariant,
  type MigrateLegacyAttachmentOptions,
  type MigrateLegacyAttachmentColumnOptions,
  type MigratedAttachmentRow,
} from "./migrate_legacy_attachment.js";
export {
  migrateLegacyAttachmentRecords,
  type LegacyAttachmentMigrationRecord,
  type LegacyAttachmentMigrationResult,
  type LegacyAttachmentMigrationWriter,
  type MigrateLegacyAttachmentRecordsOptions,
} from "./migrate_legacy_attachment_records.js";
export {
  createLegacyAttachmentMigrationScript,
  type CreateLegacyAttachmentMigrationScriptOptions,
} from "./create_legacy_attachment_migration_script.js";
export {
  renderLegacyAttachmentMigrationScript,
  type RenderLegacyAttachmentMigrationScriptOptions,
} from "./render_legacy_attachment_migration_script.js";
