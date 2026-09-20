import type { AttachmentPersistenceOptions } from "../../core/attachment_options.js";
import type { AttachmentProcessingAdapter } from "../../core/attachment_processing_adapter.js";
import { VariantGenerationService } from "../../variants/variant_generation_service.js";
import type { VariantPathOptions } from '../../variants/variant_path.js'
import {
  LucidJsonAttachmentRegistry,
  type JsonAttachmentModels,
} from "./json/lucid_json_attachment_registry.js";
import { LucidJsonVariantGenerationService } from "./json/lucid_json_variant_generation_service.js";

export type LegacyAttachmentConfig = { models: JsonAttachmentModels; variant?: VariantPathOptions };

/** The single activation boundary for JSON repositories, metadata and variant jobs. */
export function createLegacyAttachmentAdapter(
  options: LegacyAttachmentConfig & {
    defaultDisk: string;
    defaults?: AttachmentPersistenceOptions;
  },
): AttachmentProcessingAdapter & { repository: LucidJsonAttachmentRegistry } {
  const registry = new LucidJsonAttachmentRegistry(options);
  return {
    name: "json",
    repository: registry,
    metadataPersister: registry,
    variants(attachments, converters) {
      // Never overwrite an existing variant while generating its replacement.
      const generator = new VariantGenerationService({
        converters,
        ...(options.variant ? { variant: options.variant } : {}),
        attachments: {
          read: attachments.read.bind(attachments),
          remove: attachments.remove.bind(attachments),
          getVariantMetadataEnabled:
            attachments.getVariantMetadataEnabled.bind(attachments),
          create: (input) =>
            attachments.createDraft(input, { rename: true }).persist(),
          createDraft: (input) =>
            attachments.createDraft(input, { rename: true }),
        },
      });
      return new LucidJsonVariantGenerationService({
        attachments,
        generator,
        registry,
      });
    },
  };
}
