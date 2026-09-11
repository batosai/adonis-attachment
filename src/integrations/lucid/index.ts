/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export { AttachmentModel } from "./models/attachment_model.js";
export { LucidJsonAttachmentRegistry, type JsonAttachmentModels } from './json/lucid_json_attachment_registry.js';
export { LucidJsonVariantGenerationService } from './json/lucid_json_variant_generation_service.js';
export {
  LucidJsonAttachmentStore,
  type LucidJsonAttachmentStoreOptions,
} from './json/lucid_json_attachment_store.js';
export {
  JsonAttachmentEntry,
  JsonAttachmentRecord,
  type JsonAttachmentOwner,
} from './json/json_attachment_document.js';
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
  attachmentRelation as attachment,
  attachmentsRelation as attachments,
  attachmentRelation,
  attachmentsRelation,
  AttachmentRelation,
  AttachmentCollectionRelation,
  type AttachmentRelationOptions,
  type AttachmentRelationDefinition,
  type AttachmentRelationKind,
  type AttachmentPersistenceMode,
  type AttachmentRelationEntry,
  type AttachmentRelationRecord,
} from "./relations/attachment_relation.js";
export {
  AttachmentRegenerator,
  type AttachmentRegenerationOptions,
  type AttachmentRegenerationResult,
} from "./regeneration/attachment_regenerator.js";
export { LucidAttachmentRepository } from "./persistence/lucid_attachment_repository.js";
export { LucidAttachmentMetadataPersister } from "./persistence/lucid_attachment_metadata_persister.js";
export {
  LucidAttachmentStore,
  type LucidAttachmentWithVariants,
  type LucidAttachmentStoreOptions,
} from "./persistence/lucid_attachment_store.js";
export {
  LucidAttachmentLifecycleService,
  AttachmentFileCleanupError,
  type AttachmentFileService,
  type LucidAttachmentPersistence,
} from "./persistence/lucid_attachment_lifecycle_service.js";
export { AttachmentCommitError, AttachmentPostCommitError } from "./persistence/attachment_transaction.js";
export {
  LucidVariantGenerationService,
  PersistedAttachmentNotFoundError,
  type LucidVariantGenerationServiceOptions,
} from "./persistence/lucid_variant_generation_service.js";
export {
  createLucidAttachmentProcessor,
  type CreateLucidAttachmentProcessorOptions,
} from "./create_lucid_attachment_processor.js";
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
  type LegacyAttachment,
  type LegacyVariant,
  type MigrateLegacyAttachmentOptions,
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
  createLegacyAttachmentMigrationStubState,
  type LegacyAttachmentMigrationStubOptions,
  type LegacyAttachmentMigrationStubState,
} from "./migrations/legacy/legacy_attachment_migration_stub.js";
