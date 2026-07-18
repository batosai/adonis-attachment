import type { Attachment } from '../../core/attachment.js'
import { createAttachmentOwnerKey, type AttachmentOwner } from './attachment_owner.js'
import { AttachmentModel } from './attachment_model.js'

export type LucidAttachmentWithVariants = {
  original: AttachmentModel
  variants: AttachmentModel[]
}

export class LucidAttachmentStore {
  readonly #model: typeof AttachmentModel

  constructor(model: typeof AttachmentModel = AttachmentModel) {
    this.#model = model
  }

  createOriginal(owner: AttachmentOwner, attachment: Attachment): Promise<AttachmentModel> {
    return this.#model.create({
      ...attachment,
      attachableType: owner.type,
      attachableId: owner.id,
      field: owner.field,
      ownerKey: createAttachmentOwnerKey(owner),
      parentId: null,
      variantKey: null,
      metadata: attachment.metadata ?? null,
    })
  }

  createVariant(
    original: AttachmentModel,
    key: string,
    attachment: Attachment
  ): Promise<AttachmentModel> {
    return this.#model.create({
      ...attachment,
      attachableType: original.attachableType,
      attachableId: original.attachableId,
      field: original.field,
      ownerKey: null,
      parentId: original.id,
      variantKey: key,
      metadata: attachment.metadata ?? null,
    })
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
    return this.#model
      .query()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNull('parent_id')
      .first()
  }

  findById(id: string): Promise<AttachmentModel | null> {
    return this.#model.find(id)
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
    return this.#model.query().where('parent_id', originalId)
  }

  async remove(original: AttachmentModel): Promise<void> {
    await original.delete()
  }
}
