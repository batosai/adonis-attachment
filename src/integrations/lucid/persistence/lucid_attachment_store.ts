/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { randomUUID } from 'node:crypto'

import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import type { Attachment } from '../../../core/attachment.js'
import { markAttachmentPersisted } from '../../../core/attachment_state.js'
import { createAttachmentOwnerKey, type AttachmentOwner } from '../relations/attachment_owner.js'
import { AttachmentLinkModel } from '../models/attachment_link_model.js'
import { AttachmentModel } from '../models/attachment_model.js'
import { AttachmentNotFoundError, AttachmentValidationError } from '../../../errors.js'

export type LucidAttachmentWithVariants = {
  original: AttachmentLinkModel
  variants: AttachmentModel[]
}

export type ReplacedLucidVariant = {
  variant: AttachmentModel
  replaced: Attachment | undefined
}

export type LucidAttachmentStoreOptions = {
  client?: TransactionClientContract
  linkModel?: typeof AttachmentLinkModel
  createLinkId?: () => string
}

/**
 * Persists immutable file blobs separately from their polymorphic owner links.
 */
export class LucidAttachmentStore {
  readonly #blobModel: typeof AttachmentModel
  readonly #linkModel: typeof AttachmentLinkModel
  readonly #client: TransactionClientContract | undefined
  readonly #createLinkId: () => string

  constructor(
    blobModel: typeof AttachmentModel = AttachmentModel,
    options: LucidAttachmentStoreOptions = {}
  ) {
    this.#blobModel = blobModel
    this.#linkModel = options.linkModel ?? AttachmentLinkModel
    this.#client = options.client
    this.#createLinkId = options.createLinkId ?? randomUUID
  }

  async createOriginal(owner: AttachmentOwner, attachment: Attachment): Promise<AttachmentLinkModel> {
    const blob = await this.#createBlob(attachment)

    try {
      return await this.#createLink(owner, blob, { ownerKey: createAttachmentOwnerKey(owner) })
    } catch (error) {
      await blob.delete().catch(() => undefined)
      throw error
    }
  }

  async createCollectionItem(
    owner: AttachmentOwner,
    attachment: Attachment,
    position?: number
  ): Promise<AttachmentLinkModel> {
    const items = await this.listCollection(owner)
    const target = normalizePosition(position, items.length)
    const blob = await this.#createBlob(attachment)

    try {
      await this.#shiftCollection(items, target, 1)
      return await this.#createLink(owner, blob, { position: target })
    } catch (error) {
      await blob.delete().catch(() => undefined)
      throw error
    }
  }

  async createOriginalLink(owner: AttachmentOwner, attachmentId: string): Promise<AttachmentLinkModel> {
    const blob = await this.#findBlobOrFail(attachmentId)
    return this.#createLink(owner, blob, { ownerKey: createAttachmentOwnerKey(owner) })
  }

  async createCollectionLink(
    owner: AttachmentOwner,
    attachmentId: string,
    position?: number
  ): Promise<AttachmentLinkModel> {
    const items = await this.listCollection(owner)
    const target = normalizePosition(position, items.length)
    const blob = await this.#findBlobOrFail(attachmentId)

    await this.#shiftCollection(items, target, 1)
    return this.#createLink(owner, blob, { position: target })
  }

  createVariant(
    original: AttachmentModel,
    key: string,
    attachment: Attachment
  ): Promise<AttachmentModel> {
    return this.#createBlob(attachment, { parentId: original.id, variantKey: key })
  }

  /**
   * Updates an existing variant in one database write when it has the same key.
   * The previous file is returned for cleanup only after that write succeeds.
   */
  async replaceVariant(
    original: AttachmentModel,
    key: string,
    attachment: Attachment
  ): Promise<ReplacedLucidVariant> {
    const existing = await this.#blobQuery()
      .where('parent_id', original.id)
      .where('variant_key', key)
      .first()

    if (!existing) {
      return { variant: await this.createVariant(original, key, attachment), replaced: undefined }
    }

    const replaced = existing.toAttachment()
    existing.disk = attachment.disk
    existing.path = attachment.path
    existing.name = attachment.name
    existing.originalName = attachment.originalName
    existing.mimeType = attachment.mimeType
    existing.extname = attachment.extname
    existing.size = attachment.size
    existing.blurhash = attachment.blurhash ?? null
    existing.metadata = attachment.metadata ?? null
    await existing.save()
    markAttachmentPersisted(attachment)

    return { variant: existing, replaced }
  }

  async releaseOwner(original: AttachmentLinkModel): Promise<void> {
    original.ownerKey = null
    await original.save()
  }

  async restoreOwner(original: AttachmentLinkModel): Promise<void> {
    original.ownerKey = createAttachmentOwnerKey({
      type: original.attachableType,
      id: original.attachableId,
      field: original.field,
    })
    await original.save()
  }

  findOriginal(owner: AttachmentOwner): Promise<AttachmentLinkModel | null> {
    return this.#linkQuery()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNotNull('owner_key')
      .first()
  }

  listCollection(owner: AttachmentOwner): Promise<AttachmentLinkModel[]> {
    return this.#linkQuery()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNull('owner_key')
      .orderBy('position', 'asc')
  }

  findCollectionItem(owner: AttachmentOwner, id: string): Promise<AttachmentLinkModel | null> {
    return this.#linkQuery()
      .where('id', id)
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNull('owner_key')
      .first()
  }

  async removeCollectionItem(
    owner: AttachmentOwner,
    item: AttachmentLinkModel
  ): Promise<AttachmentModel[]> {
    const removed = await this.remove(item)
    await this.#normalizeCollection(owner)
    return removed
  }

  async moveCollectionItem(
    owner: AttachmentOwner,
    id: string,
    position: number
  ): Promise<AttachmentLinkModel[]> {
    const items = await this.listCollection(owner)
    const source = items.findIndex((item) => item.id === id)

    if (source === -1) {
      throw new AttachmentValidationError(`Attachment link "${id}" does not belong to this collection`)
    }

    const target = normalizePosition(position, items.length - 1)

    if (source === target) {
      return items
    }

    const [item] = items.splice(source, 1)
    items.splice(target, 0, item!)
    await this.#reorderCollection(items)

    return items
  }

  findById(id: string): Promise<AttachmentModel | null> {
    return this.#blobQuery().where('id', id).first()
  }

  async findByOwner(owner: AttachmentOwner): Promise<LucidAttachmentWithVariants | null> {
    const original = await this.findOriginal(owner)

    if (!original) {
      return null
    }

    return {
      original,
      variants: await this.listVariants(original.attachmentId),
    }
  }

  listVariants(originalId: string): Promise<AttachmentModel[]> {
    return this.#blobQuery().where('parent_id', originalId)
  }

  /**
   * Deletes a link and returns blobs that became unreferenced and were removed.
   */
  async remove(link: AttachmentLinkModel): Promise<AttachmentModel[]> {
    const attachment = link.attachment ?? (await this.findById(link.attachmentId))
    await link.delete()

    if (!attachment || (await this.#linkQuery().where('attachment_id', attachment.id).first())) {
      return []
    }

    const variants = await this.listVariants(attachment.id)
    await attachment.delete()

    return [attachment, ...variants]
  }

  listOwnerLinks(owner: AttachmentOwner): Promise<AttachmentLinkModel[]> {
    return this.#linkQuery()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
  }

  async #createBlob(
    attachment: Attachment,
    options: { parentId?: string; variantKey?: string } = {}
  ): Promise<AttachmentModel> {
    const blob = await this.#blobModel.create(
      {
        ...attachment,
        parentId: options.parentId ?? null,
        variantKey: options.variantKey ?? null,
        blurhash: attachment.blurhash ?? null,
        metadata: attachment.metadata ?? null,
      },
      this.#client ? { client: this.#client } : undefined
    )

    markAttachmentPersisted(attachment)
    return blob
  }

  async #findBlobOrFail(id: string): Promise<AttachmentModel> {
    const blob = await this.findById(id)

    if (!blob) {
      throw new AttachmentNotFoundError(id)
    }

    return blob
  }

  async #createLink(
    owner: AttachmentOwner,
    attachment: AttachmentModel,
    options: { ownerKey?: string; position?: number } = {}
  ): Promise<AttachmentLinkModel> {
    const link = await this.#linkModel.create(
      {
        id: this.#createLinkId(),
        attachableType: owner.type,
        attachableId: owner.id,
        field: owner.field,
        ownerKey: options.ownerKey ?? null,
        position: options.position ?? null,
        attachmentId: attachment.id,
      },
      this.#client ? { client: this.#client } : undefined
    )

    return this.#linkQuery().where('id', link.id).firstOrFail()
  }

  async #normalizeCollection(owner: AttachmentOwner): Promise<void> {
    await this.#reorderCollection(await this.listCollection(owner))
  }

  #blobQuery() {
    return this.#blobModel.query(this.#client ? { client: this.#client } : undefined)
  }

  #linkQuery() {
    return this.#linkModel
      .query(this.#client ? { client: this.#client } : undefined)
      .preload('attachment')
  }

  async #shiftCollection(
    items: readonly AttachmentLinkModel[],
    from: number,
    amount: number
  ): Promise<void> {
    for (const item of [...items].reverse()) {
      if ((item.position ?? 0) < from) {
        continue
      }

      item.position = (item.position ?? 0) + amount
      await item.save()
    }
  }

  async #reorderCollection(items: readonly AttachmentLinkModel[]): Promise<void> {
    const offset = items.length + 1

    for (const item of items) {
      item.position = (item.position ?? 0) + offset
      await item.save()
    }

    for (const [position, item] of items.entries()) {
      item.position = position
      await item.save()
    }
  }
}

function normalizePosition(position: number | undefined, maximum: number): number {
  if (position === undefined) {
    return maximum
  }

  if (!Number.isSafeInteger(position) || position < 0) {
    throw new AttachmentValidationError('Attachment collection positions must be non-negative integers')
  }

  return Math.min(position, maximum)
}
