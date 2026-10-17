/**
 * Runtime entry point that reports a clear error when the optional Lucid peer is absent.
 * Package types continue to come from the static Lucid store declaration.
 */
import { loadOptionalDependency } from './utils/optional_dependency.js'

const lucid = await loadOptionalDependency('@adonisjs/lucid', () => import('./stores/lucid/index.js'))

export const {
  AttachmentModel,
  AttachmentLinkModel,
  configureLucidAttachmentTables,
  resolveAttachmentTableNames,
  AttachmentSchemaService,
  attachment,
  attachments,
  attachmentRelation,
  attachmentsRelation,
  AttachmentRelation,
  AttachmentCollectionRelation,
  AttachmentRegenerator,
  LucidAttachmentRepository,
  LucidAttachmentMetadataPersister,
  LucidAttachmentStore,
  LucidAttachmentLifecycleService,
  AttachmentFileCleanupError,
  LucidVariantGenerationService,
  PersistedAttachmentNotFoundError,
  createLucidAttachmentProcessor,
  createAttachmentOwnerKey,
  createAttachmentsTableStubState,
  migrateLegacyAttachment,
  migrateLegacyAttachmentRecords,
  createLegacyAttachmentMigrationStubState,
} = lucid
