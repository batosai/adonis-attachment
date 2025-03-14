import type { ModelWithAttachment } from '../types/mixin.js'
import type { Attachment as AttachmentType, LucidOptions } from '../types/attachment.js'
import type { Record as RecordImplementation } from '../types/service.js'

import attachmentManager from '../../services/main.js'
import { defaultStateAttributeMixin } from '../utils/default_values.js'
import { Attachment } from '../attachments/attachment.js'
import { optionsSym } from '../utils/symbols.js'
import { ConverterManager } from '../converter_manager.js'
import { E_CANNOT_CREATE_VARIANT } from '../errors.js'

export default class Record implements RecordImplementation {
  #model: ModelWithAttachment

  constructor(model: ModelWithAttachment) {
    this.#model = model

    if (!this.#model.$attachments) {
      /**
       * Empty previous $attachments
       */
      this.#model.$attachments = structuredClone(defaultStateAttributeMixin)
    }
  }

  /**
   * During commit, we should cleanup the old detached files
   */
  async commit(): Promise<void> {
    await Promise.allSettled(
      this.#model.$attachments.detached.map((attachment: AttachmentType) =>
        attachmentManager.delete(attachment)
      )
    )
  }

  /**
   * During rollback we should remove the attached files.
   */
  async rollback(): Promise<void> {
    await Promise.allSettled(
      this.#model.$attachments.attached.map((attachment: AttachmentType) =>
        attachmentManager.delete(attachment)
      )
    )
  }

  async persist(): Promise<void> {
    const attachmentAttributeNames = this.#getDirtyAttributeNamesOfAttachment()

    /**
     * Persist attachments before saving the model to the database. This
     * way if file saving fails we will not write anything to the
     * database
     */
    await Promise.all(
      attachmentAttributeNames.map(async (name) => {
        const originalAttachments = this.#getOriginalAttachmentsByAttributeName(name)
        const newAttachments = this.#getAttachmentsByAttributeName(name)
        const options = this.#getOptionsByAttributeName(name)

        /**
         * Skip when the attachment attributeName hasn't been updated
         */
        if (!originalAttachments && !newAttachments) {
          return
        }

        /**
         * memorise attribute name for generate variants
         */
        this.#model.$attachments.dirtied.push(name)

        for (let i = 0; i < newAttachments.length; i++) {
          if (originalAttachments.includes(newAttachments[i])) {
            continue
          }

          /**
           * If there is a new file and its local then we must save this
           * file.
           */
          if (newAttachments[i]) {
            newAttachments[i].setOptions(options).makeFolder(this.#model)
            this.#model.$attachments.attached.push(newAttachments[i])

            /**
             * Also write the file to the disk right away
             */
            await attachmentManager.save(newAttachments[i])
          }
        }
      })
    )
  }

  async transaction(options = { enabledRollback: true }): Promise<void> {
    try {
      if (this.#model.$trx) {
        this.#model.$trx.after('commit', () => this.commit())
        if (options.enabledRollback) {
          this.#model.$trx.after('rollback', () => this.rollback())
        }
      } else {
        await this.commit()
      }
    } catch (error: unknown) {
      if (options.enabledRollback) {
        await this.rollback()
      }
      throw error
    }
  }

  async preComputeUrl(): Promise<void> {
    const attachmentAttributeNames = this.#getAttributeNamesOfAttachment()

    await Promise.all(
      attachmentAttributeNames.map(async (name) => {
        const options = this.#getOptionsByAttributeName(name)

        if (this.#model.$attributes[name]) {
          const attachments = this.#getAttachmentsByAttributeName(name)
          for (let i = 0; i < attachments.length; i++) {
            attachments[i].setOptions(options)
            await attachmentManager.preComputeUrl(attachments[i])
          }
        }
      })
    )
  }

  async generateVariants(): Promise<void> {
    /* this.#model.$dirty is not avalable in afterSave hooks */
    const attachmentAttributeNames = this.#model.$attachments.dirtied

    /**
     * For all properties Attachment
     * Launch async generation variants
     */

    for await (const name of attachmentAttributeNames) {
      const record = this
      attachmentManager.queue.push({
        name: `${this.#model.constructor.name}-${name}`,
        async run() {
          try {
            const converterManager = new ConverterManager({
              record,
              attributeName: name,
              options: record.#getOptionsByAttributeName(name),
            })
            await converterManager.save()
          } catch (err) {
            throw new E_CANNOT_CREATE_VARIANT([err.message])
          }
        },
      })
    }
  }

  async detach() {
    const attachmentAttributeNames = this.#getDirtyAttributeNamesOfAttachment()

    /**
     * Mark all original attachments for deletion
     */
    return Promise.allSettled(
      attachmentAttributeNames.map((name) => {
        let attachments: AttachmentType[] = []
        const options = this.#getOptionsByAttributeName(name)

        if (this.#model.$dirty[name] === null) {
          attachments = this.#getOriginalAttachmentsByAttributeName(name)
        } else {
          const originalAttachments = this.#getOriginalAttachmentsByAttributeName(name)
          const newAttachments = this.#getAttachmentsByAttributeName(name)

          /**
           * Clean Attachments changed
           */
          for (let i = 0; i < originalAttachments.length; i++) {
            if (newAttachments.includes(originalAttachments[i])) {
              continue
            }

            /**
             * If there was an existing file, then we must get rid of it
             */
            if (originalAttachments[i]) {
              originalAttachments[i].setOptions(options)
              attachments.push(originalAttachments[i])
            }
          }
        }

        for (let i = 0; i < attachments.length; i++) {
          attachments[i].setOptions(options)
          this.#model.$attachments.detached.push(attachments[i])
        }
      })
    )
  }

  async detachAll() {
    const attachmentAttributeNames = this.#getAttributeNamesOfAttachment()

    /**
     * Mark all attachments for deletion
     */
    return Promise.allSettled(
      attachmentAttributeNames.map((name) => {
        const options = this.#getOptionsByAttributeName(name)
        const attachments = this.#getAttachmentsByAttributeName(name)
        for (let i = 0; i < attachments.length; i++) {
          attachments[i].setOptions(options)
          this.#model.$attachments.detached.push(attachments[i])
        }
      })
    )
  }

  get model() {
    return this.#model
  }

  getAttachments(options: { attributeName: string; requiredOriginal?: boolean }) {
    if (options.requiredOriginal) {
      return this.#getOriginalAttachmentsByAttributeName(options.attributeName)
    } else {
      return this.#getAttachmentsByAttributeName(options.attributeName)
    }
  }

  #getAttachmentsByAttributeName(name: string): AttachmentType[] {
    if (Array.isArray(this.#model.$attributes[name])) {
      return this.#model.$attributes[name] as AttachmentType[]
    }
    return [this.#model.$attributes[name] as AttachmentType]
  }

  #getOriginalAttachmentsByAttributeName(name: string): AttachmentType[] {
    if (Array.isArray(this.#model.$original[name])) {
      return this.#model.$original[name] as AttachmentType[]
    }
    return [this.#model.$original[name] as AttachmentType]
  }

  #getOptionsByAttributeName(name: string): LucidOptions {
    return this.#model.constructor.prototype[optionsSym]?.[name]
  }

  #getAttributeNamesOfAttachment() {
    return Object.keys(this.#model.$attributes).filter((name) => {
      const value = this.#model.$attributes[name]
      return (
        value instanceof Attachment ||
        (Array.isArray(value) && value.every((item) => item instanceof Attachment))
      )
    })
  }

  #getDirtyAttributeNamesOfAttachment() {
    return Object.keys(this.#model.$dirty).filter((name) => {
      const dirtyValue = this.#model.$dirty[name]
      const originalValue = this.#model.$original[name] // if dirtyValue is null, check original type

      const isDirtyAttachment =
        dirtyValue instanceof Attachment ||
        (Array.isArray(dirtyValue) &&
          dirtyValue.every((item) => item instanceof Attachment) &&
          dirtyValue.length)

      const isOriginalAttachment =
        originalValue instanceof Attachment ||
        (Array.isArray(originalValue) && originalValue.every((item) => item instanceof Attachment))

      return isDirtyAttachment || isOriginalAttachment
    })
  }
}
