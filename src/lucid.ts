/**
 * Runtime entry point that reports a clear error when the optional Lucid peer is absent.
 * Package types continue to come from the static Lucid integration declaration.
 */
import { loadOptionalDependency } from './utils/optional_dependency.js'

const lucid = await loadOptionalDependency('@adonisjs/lucid', () => import('./integrations/lucid/index.js'))

export const {
  AttachmentModel,
  AttachmentLinkModel,
  configureLucidAttachmentTables,
  resolveAttachmentTableNames,
  AttachmentSchemaService,
  attachment,
  attachmentRelation,
  attachmentsRelation,
  AttachmentRelation,
  AttachmentCollectionRelation,
  AttachmentRegenerator,
  LucidAttachmentRepository,
  LucidAttachmentMetadataPersister,
  LucidAttachmentStore,
  LucidAttachmentLifecycleService,
  LucidVariantGenerationService,
  PersistedAttachmentNotFoundError,
  createLucidAttachmentProcessor,
  createAttachmentOwnerKey,
  createAttachmentsTableStubState,
  migrateLegacyAttachment,
  migrateLegacyAttachmentColumn,
  migrateLegacyAttachmentRecords,
  createLegacyAttachmentMigrationStubState,
} = lucid
