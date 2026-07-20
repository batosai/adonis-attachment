/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../../core/attachment.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { markAttachmentPersisted } from '../../core/attachment_state.js'
import { createAttachmentOwnerKey, type AttachmentOwner } from './attachment_owner.js'
import { AttachmentModel } from './attachment_model.js'

export type LucidAttachmentWithVariants = {
  original: AttachmentModel
  variants: AttachmentModel[]
}

export type LucidAttachmentStoreOptions = {
  client?: TransactionClientContract
}

export class LucidAttachmentStore {
  readonly #model: typeof AttachmentModel
  readonly #client: TransactionClientContract | undefined

  constructor(
    model: typeof AttachmentModel = AttachmentModel,
    options: LucidAttachmentStoreOptions = {}
  ) {
    this.#model = model
    this.#client = options.client
  }

  async createOriginal(owner: AttachmentOwner, attachment: Attachment): Promise<AttachmentModel> {
    const row = await this.#model.create({
      ...attachment,
      attachableType: owner.type,
      attachableId: owner.id,
      field: owner.field,
      ownerKey: createAttachmentOwnerKey(owner),
      position: null,
      parentId: null,
      variantKey: null,
      metadata: attachment.metadata ?? null,
    }, this.#client ? { client: this.#client } : undefined)

    markAttachmentPersisted(attachment)
    return row
  }

  async createCollectionItem(
    owner: AttachmentOwner,
    attachment: Attachment,
    position?: number
  ): Promise<AttachmentModel> {
    const items = await this.listCollection(owner)
    const target = normalizePosition(position, items.length)

    await this.#shiftCollection(items, target, 1)

    const row = await this.#model.create({
      ...attachment,
      attachableType: owner.type,
      attachableId: owner.id,
      field: owner.field,
      ownerKey: null,
      position: target,
      parentId: null,
      variantKey: null,
      metadata: attachment.metadata ?? null,
    }, this.#client ? { client: this.#client } : undefined)

    markAttachmentPersisted(attachment)
    return row
  }

  async createVariant(
    original: AttachmentModel,
    key: string,
    attachment: Attachment
  ): Promise<AttachmentModel> {
    const row = await this.#model.create({
      ...attachment,
      attachableType: original.attachableType,
      attachableId: original.attachableId,
      field: original.field,
      ownerKey: null,
      position: null,
      parentId: original.id,
      variantKey: key,
      metadata: attachment.metadata ?? null,
    }, this.#client ? { client: this.#client } : undefined)

    markAttachmentPersisted(attachment)
    return row
  }

  async releaseOwner(original: AttachmentModel): Promise<void> {
    original.ownerKey = null
    await original.save()
  }

  async restoreOwner(original: AttachmentModel): Promise<void> {
    original.ownerKey = createAttachmentOwnerKey({
      type: original.attachableType,
      id: original.attachableId,
      field: original.field,
    })
    await original.save()
  }

  findOriginal(owner: AttachmentOwner): Promise<AttachmentModel | null> {
    return this.#query()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNotNull('owner_key')
      .whereNull('parent_id')
      .first()
  }

  listCollection(owner: AttachmentOwner): Promise<AttachmentModel[]> {
    return this.#query()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNull('owner_key')
      .whereNull('parent_id')
      .orderBy('position', 'asc')
  }

  findCollectionItem(owner: AttachmentOwner, id: string): Promise<AttachmentModel | null> {
    return this.#query()
      .where('id', id)
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNull('owner_key')
      .whereNull('parent_id')
      .first()
  }

  async removeCollectionItem(owner: AttachmentOwner, item: AttachmentModel): Promise<void> {
    await this.remove(item)
    await this.#normalizeCollection(owner)
  }

  async moveCollectionItem(
    owner: AttachmentOwner,
    id: string,
    position: number
  ): Promise<AttachmentModel[]> {
    const items = await this.listCollection(owner)
    const source = items.findIndex((item) => item.id === id)

    if (source === -1) {
      throw new Error(`Attachment "${id}" does not belong to this collection`)
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
    return this.#query().where('id', id).first()
  }

  async findByOwner(owner: AttachmentOwner): Promise<LucidAttachmentWithVariants | null> {
    const original = await this.findOriginal(owner)

    if (!original) {
      return null
    }

    return {
      original,
      variants: await this.listVariants(original.id),
    }
  }

  listVariants(originalId: string): Promise<AttachmentModel[]> {
    return this.#query().where('parent_id', originalId)
  }

  async remove(original: AttachmentModel): Promise<void> {
    await original.delete()
  }

  async #normalizeCollection(owner: AttachmentOwner): Promise<void> {
    await this.#reorderCollection(await this.listCollection(owner))
  }

  #query() {
    return this.#model.query(this.#client ? { client: this.#client } : undefined)
  }

  async #shiftCollection(
    items: readonly AttachmentModel[],
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

  async #reorderCollection(items: readonly AttachmentModel[]): Promise<void> {
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
    throw new Error('Attachment collection positions must be non-negative integers')
  }

  return Math.min(position, maximum)
}
