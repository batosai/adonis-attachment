import { loadOptionalDependency } from "./utils/optional_dependency.js";

const legacy = await loadOptionalDependency(
  "@adonisjs/lucid",
  () => import("./stores/lucid/legacy/index.js"),
);
export const {
  Attachment,
  AttachmentManager,
  attachment,
  attachments,
  attachmentManager,
  AttachmentMetadataConflictError,
} = legacy;
