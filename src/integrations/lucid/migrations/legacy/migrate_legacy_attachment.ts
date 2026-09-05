/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export type LegacyAttachment = {
  name: string;
  originalName?: string;
  size: number;
  extname: string;
  mimeType: string;
  disk?: string;
  path?: string;
  meta?: Record<string, unknown>;
  blurhash?: string;
  variants?: LegacyVariant[];
};

export type LegacyVariant = {
  key: string;
  name: string;
  size: number;
  extname: string;
  mimeType: string;
  disk?: string;
  path?: string;
  meta?: Record<string, unknown>;
  blurhash?: string;
};

import {
  createAttachmentOwnerKey,
  type AttachmentOwner,
} from "../../relations/attachment_owner.js";
import { AttachmentError } from "../../../../errors.js";

export type { AttachmentOwner } from "../../relations/attachment_owner.js";

export type MigratedAttachmentBlob = {
  id: string;
  parentId: string | null;
  variantKey: string | null;
  disk: string;
  path: string;
  name: string;
  originalName: string;
  mimeType: string;
  extname: string;
  size: number;
  blurhash: string | null;
  metadata: Record<string, unknown> | null;
};

export type MigratedAttachmentLink = {
  id: string;
  attachableType: string;
  attachableId: string;
  field: string;
  ownerKey: string | null;
  position: number | null;
  attachmentId: string;
};

export type MigratedAttachmentRows = {
  blobs: MigratedAttachmentBlob[];
  links: MigratedAttachmentLink[];
};

export type MigrateLegacyAttachmentOptions = {
  owner: AttachmentOwner;
  defaultDisk: string;
  createId: () => string;
};

/**
 * Converts one v5 JSON attachment document into blob and polymorphic-link rows.
 * Callers can run it from an Ace command, another ORM migration, or a one-off script.
 */
export function migrateLegacyAttachment(
  value: LegacyAttachment | string,
  options: MigrateLegacyAttachmentOptions,
): MigratedAttachmentRows {
  const attachment =
    typeof value === "string" ? parseLegacyAttachment(value) : value;
  const id = options.createId();
  const originalName = attachment.originalName ?? attachment.name;
  const original = toBlob({
    id,
    attachment,
    parentId: null,
    variantKey: null,
    originalName,
    defaultDisk: options.defaultDisk,
  });

  return {
    blobs: [
      original,
      ...(attachment.variants ?? []).map((variant) =>
        toBlob({
          id: options.createId(),
          attachment: variant,
          parentId: id,
          variantKey: variant.key,
          originalName,
          defaultDisk: options.defaultDisk,
        })
      ),
    ],
    links: [
      {
        id: options.createId(),
        attachableType: options.owner.type,
        attachableId: options.owner.id,
        field: options.owner.field,
        ownerKey: createAttachmentOwnerKey(options.owner),
        position: null,
        attachmentId: id,
      },
    ],
  };
}

function parseLegacyAttachment(value: string): LegacyAttachment {
  try {
    return JSON.parse(value) as LegacyAttachment;
  } catch {
    throw new AttachmentError("Legacy attachment value must be valid JSON", {
      code: "E_INVALID_LEGACY_ATTACHMENT",
      status: 400,
    });
  }
}

function toBlob({
  id,
  attachment,
  parentId,
  variantKey,
  originalName,
  defaultDisk,
}: {
  id: string;
  attachment: Omit<LegacyAttachment, "variants">;
  parentId: string | null;
  variantKey: string | null;
  originalName: string;
  defaultDisk: string;
}): MigratedAttachmentBlob {
  return {
    id,
    parentId,
    variantKey,
    disk: attachment.disk ?? defaultDisk,
    path: attachment.path ?? attachment.name,
    name: attachment.name,
    originalName,
    mimeType: attachment.mimeType,
    extname: attachment.extname,
    size: attachment.size,
    blurhash: attachment.blurhash ?? null,
    metadata: attachment.meta ?? null,
  };
}
