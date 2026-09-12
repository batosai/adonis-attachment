import { AttachmentConflictError } from "../../errors.js";

/** A legacy metadata edit conflicts with a change since the loaded snapshot. */
export class AttachmentMetadataConflictError extends AttachmentConflictError {
  static code = "E_ATTACHMENT_METADATA_CONFLICT";
  readonly path: readonly string[];

  constructor(path: readonly string[]) {
    super(
      `Attachment metadata changed concurrently at ${JSON.stringify(path)}; reload before retrying`,
    );
    this.path = Object.freeze([...path]);
  }
}
