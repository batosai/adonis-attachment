import type { AttachmentReferenceRepository } from "./attachment_repository.js";
import type { AttachmentMetadataPersister } from "./attachment_metadata_persister.js";
import type { AttachmentService } from "./attachment_service.js";
import type { VariantGenerator } from "./attachment_job_processor.js";
import type { VariantConverterRegistry } from "../converters/configured_variant_converter_registry.js";

/** Optional persistence integration for contextual jobs, independent of its data format. */
export interface AttachmentProcessingAdapter {
  readonly name: string;
  readonly repository: AttachmentReferenceRepository;
  readonly metadataPersister: AttachmentMetadataPersister;
  variants(
    attachments: AttachmentService,
    converters: VariantConverterRegistry,
  ): VariantGenerator;
}
export type AttachmentProcessingAdapters = Readonly<
  Record<string, AttachmentProcessingAdapter>
>;
