import type { AttachmentService } from "./src/core/attachment_service.js";
import type { AttachmentRepository } from "./src/core/attachment_repository.js";
import type { AttachmentManager } from "./src/sources/attachment_manager.js";

import attachmentManager from "./services/main.js";

declare module "@adonisjs/core/types" {
  export interface ContainerBindings {
    "jrmc.attachment": AttachmentService;
    "jrmc.attachment.manager": AttachmentManager;
    "jrmc.attachment.repository": AttachmentRepository;
  }
}

export * from "./src/core/index.js";
export { configure } from "./configure.js";
export { attachmentManager };
export {
  defineConfig,
  type AttachmentConfig,
  type ResolvedAttachmentConfig,
} from "./src/define_config.js";
export { AdonisDriveStorage } from "./src/adapters/adonis_drive_storage.js";
export {
  LocalFileStorage,
  type LocalFileStorageOptions,
} from "./src/adapters/local_file_storage.js";
export {
  attachment,
  type LucidAttachmentOptions,
} from "./src/integrations/lucid/attachment_column.js";
export {
  attachmentRelation,
  attachmentsRelation,
  AttachmentRelation,
  AttachmentCollectionRelation,
  type AttachmentRelationOptions,
} from "./src/integrations/lucid/attachment_relation.js";
export {
  VariantGenerationService,
  UnknownVariantConverterError,
  type GeneratedVariant,
  type VariantGenerationServiceOptions,
} from "./src/variants/variant_generation_service.js";
export {
  type VariantConverter,
  type VariantConversionInput,
  type VariantConversionOutput,
} from "./src/variants/variant_converter.js";
export { MemoryAttachmentQueue } from "./src/queues/memory_queue.js";
export {
  AttachmentManager,
  AttachmentSourceError,
  type AttachmentManagerOptions,
  type AttachmentSourceFetch,
  type AttachmentSourceOptions,
  type AttachmentSourceResponse,
  type MultipartAttachmentFile,
} from "./src/sources/attachment_manager.js";
export {
  AdonisAttachmentQueue,
  type AdonisAttachmentJob,
  type AdonisAttachmentQueueOptions,
  type AdonisQueueDispatcher,
} from "./src/queues/adonis_queue.js";
export {
  migrateLegacyAttachment,
  migrateLegacyAttachmentColumn,
  type AttachmentOwner,
  type LegacyAttachment,
  type LegacyVariant,
  type MigrateLegacyAttachmentColumnOptions,
  type MigratedAttachmentBlob,
  type MigratedAttachmentLink,
  type MigratedAttachmentRows,
} from "./src/integrations/lucid/migrate_legacy_attachment.js";
export { createAttachmentOwnerKey } from "./src/integrations/lucid/attachment_owner.js";
export { createAttachmentsTableStubState } from "./src/integrations/lucid/attachments_table_stub.js";
