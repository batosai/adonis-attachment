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
};

import {
  createAttachmentOwnerKey,
  type AttachmentOwner,
} from "./attachment_owner.js";
import type { Attachment } from "../../core/attachment.js";

export type { AttachmentOwner } from "./attachment_owner.js";

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

export type MigrateLegacyAttachmentColumnOptions = Omit<
  MigrateLegacyAttachmentOptions,
  "owner"
>;

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

/**
 * Converts one v5 JSON value for a retained single attachment column. Legacy
 * variants require the polymorphic table and therefore cannot be kept here.
 */
export function migrateLegacyAttachmentColumn(
  value: LegacyAttachment | string,
  options: MigrateLegacyAttachmentColumnOptions,
): Attachment {
  const attachment =
    typeof value === "string" ? parseLegacyAttachment(value) : value;

  if (attachment.variants?.length) {
    throw new Error(
      "Legacy attachments with variants must migrate to the polymorphic table",
    );
  }

  const originalName = attachment.originalName ?? attachment.name;

  return {
    id: options.createId(),
    disk: attachment.disk ?? options.defaultDisk,
    path: attachment.path ?? attachment.name,
    name: attachment.name,
    originalName,
    mimeType: attachment.mimeType,
    extname: attachment.extname,
    size: attachment.size,
    ...(attachment.meta ? { metadata: attachment.meta } : {}),
  };
}

function parseLegacyAttachment(value: string): LegacyAttachment {
  try {
    return JSON.parse(value) as LegacyAttachment;
  } catch {
    throw new Error("Legacy attachment value must be valid JSON");
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
    metadata: attachment.meta ?? null,
  };
}
