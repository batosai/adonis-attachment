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

export type MigratedAttachmentRow = {
  id: string;
  attachableType: string;
  attachableId: string;
  field: string;
  ownerKey: string | null;
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
 * Converts one v5 JSON attachment document into rows for the polymorphic table.
 * Callers can run it from an Ace command, another ORM migration, or a one-off script.
 */
export function migrateLegacyAttachment(
  value: LegacyAttachment | string,
  options: MigrateLegacyAttachmentOptions,
): MigratedAttachmentRow[] {
  const attachment =
    typeof value === "string" ? parseLegacyAttachment(value) : value;
  const id = options.createId();
  const originalName = attachment.originalName ?? attachment.name;
  const original = toRow({
    id,
    attachment,
    owner: options.owner,
    ownerKey: createAttachmentOwnerKey(options.owner),
    parentId: null,
    variantKey: null,
    originalName,
    defaultDisk: options.defaultDisk,
  });

  return [
    original,
    ...(attachment.variants ?? []).map((variant) =>
      toRow({
        id: options.createId(),
        attachment: variant,
        owner: options.owner,
        ownerKey: null,
        parentId: id,
        variantKey: variant.key,
        originalName,
        defaultDisk: options.defaultDisk,
      }),
    ),
  ];
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

function toRow({
  id,
  attachment,
  owner,
  ownerKey,
  parentId,
  variantKey,
  originalName,
  defaultDisk,
}: {
  id: string;
  attachment: Omit<LegacyAttachment, "variants">;
  owner: AttachmentOwner;
  ownerKey: string | null;
  parentId: string | null;
  variantKey: string | null;
  originalName: string;
  defaultDisk: string;
}): MigratedAttachmentRow {
  return {
    id,
    attachableType: owner.type,
    attachableId: owner.id,
    field: owner.field,
    ownerKey,
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
