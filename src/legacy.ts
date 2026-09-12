import { loadOptionalDependency } from "./utils/optional_dependency.js";

const legacy = await loadOptionalDependency(
  "@adonisjs/lucid",
  () => import("./integrations/legacy/index.js"),
);
export const { Attachment, AttachmentManager, attachment, attachmentManager, AttachmentMetadataConflictError } =
  legacy;
