import type { AttachmentService } from "./src/core/attachment_service.js";
import type { AttachmentRepository } from "./src/core/attachment_repository.js";
import type { AttachmentManager } from "./src/sources/attachment_manager.js";
import type { VariantConverterRegistry } from "./src/converters/configured_variant_converter_registry.js";

import attachmentManager from "./services/main.js";
import attachmentConverters from "./services/converters.js";

/** Augment this interface with `InferConverters<typeof attachmentConfig>` for typed variant keys. */
export interface AttachmentVariants {}

export type AttachmentVariantKey = [keyof AttachmentVariants] extends [never]
  ? string
  : Extract<keyof AttachmentVariants, string>;

declare module "@adonisjs/core/types" {
  export interface ContainerBindings {
    "jrmc.attachment": AttachmentService;
    "jrmc.attachment.manager": AttachmentManager;
    "jrmc.attachment.converters": VariantConverterRegistry;
    "jrmc.attachment.repository": AttachmentRepository;
  }
}

export * from "./src/core/index.js";
export { configure } from "./configure.js";
export { attachmentManager };
export { attachmentConverters };
export {
  defineConfig,
  type AttachmentIntegrationsConfig,
  type AttachmentMediaConfig,
  type AttachmentConvertersConfig,
  type AttachmentConfig,
  type InferConverters,
  type LucidAttachmentConfig,
  type ResolvedAttachmentConfig,
} from "./src/define_config.js";
export { AdonisDriveStorage } from "./src/adapters/adonis_drive_storage.js";
export {
  LocalFileStorage,
  type LocalFileStorageOptions,
} from "./src/adapters/local_file_storage.js";
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
