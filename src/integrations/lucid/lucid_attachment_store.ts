import type { Attachment } from '../../core/attachment.js'
import type { AttachmentOwner } from './attachment_owner.js'
import { AttachmentModel } from './attachment_model.js'

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
      parentId: original.id,
      variantKey: key,
      metadata: attachment.metadata ?? null,
    })
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

  listVariants(originalId: string): Promise<AttachmentModel[]> {
    return this.#model.query().where('parent_id', originalId)
  }

  async remove(original: AttachmentModel): Promise<void> {
    await original.delete()
  }
}
