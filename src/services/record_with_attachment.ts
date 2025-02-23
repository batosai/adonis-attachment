import type { ModelWithAttachment } from "../types/mixin.js";
import type { Attachment as AttachmentType, LucidOptions } from '../types/attachment.js'
import type { Record as RecordImplementation } from '../types/service.js'

import attachmentManager from '../../services/main.js'
import {
  clone
} from '../utils/helpers.js'
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
      this.#model.$attachments = clone(defaultStateAttributeMixin)
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
    const attachmentAttributeNames = this.#getDirtyAttributeNamesAttachment()

    /**
     * Persist attachments before saving the model to the database. This
     * way if file saving fails we will not write anything to the
     * database
     */
    await Promise.all(
      attachmentAttributeNames.map(async (name) => {
        const existingAttachments = this.#getOriginalAttachmentsByAttributeName(name)
        const newAttachments = this.#getAttachmentsByAttributeName(name)
        const options = this.#getOptionsByAttributeName(name)

        /**
         * Skip when the attachment attributeName hasn't been updated
         */
        if (!existingAttachments && !newAttachments) {
          return
        }

        /**
         * memorise attribute name for generate variants
         */
        this.#model.$attachments.attributesModified.push(name)

        for (let i = 0; i < existingAttachments.length; i++) {
          if (newAttachments.includes(existingAttachments[i])) {
            continue
          }

          /**
           * If there was an existing file, then we must get rid of it
           */
          if (existingAttachments[i]) {
            existingAttachments[i].setOptions(options)
            this.#model.$attachments.detached.push(existingAttachments[i])
          }
        }

        for (let i = 0; i < newAttachments.length; i++) {
          if (existingAttachments.includes(newAttachments[i])) {
            continue
          }

          /**
           * If there is a new file and its local then we must save this
           * file.
           */
          if (newAttachments[i]) {
            newAttachments[i].setOptions(options)
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
    const attachmentAttributeNames = this.#getAttributeNamesAttachment()

    await Promise.all(
      attachmentAttributeNames.map(async (name) => {
        const options = this.#getOptionsByAttributeName(name)

        if (Array.isArray(this.#model.$attributes[name])) {
          const attachments = this.#model.$attributes[name] as Attachment[]
          for (let i = 0; i < attachments.length; i++) {
            attachments[i].setOptions(options)
            await attachmentManager.preComputeUrl(attachments[i])
          }
        } else {
          const attachment = this.#model.$attributes[name] as Attachment

          attachment.setOptions(options)

          return attachmentManager.preComputeUrl(attachment)
        }
      })
    )
  }

  async generateVariants(): Promise<void> {
    const attachmentAttributeNames = this.#getAttributeNamesAttachment()

    /**
     * For all properties Attachment
     * Launch async generation variants
     */
    await Promise.all(
      attachmentAttributeNames.map((name) => {
        if (this.#model.$attachments.attributesModified.includes(name)) {
          const record = this
          attachmentManager.queue.push({
            name: `${this.#model.constructor.name}-${name}`,
            async run() {
              try {
                const converterManager = new ConverterManager({
                  record,
                  attributeName: name,
                  options: record.#getOptionsByAttributeName(name)
                })
                await converterManager.save()
              } catch (err) {
                throw new E_CANNOT_CREATE_VARIANT([err.message])
              }
            },
          })
        }
      })
    )
  }

  async detach() {
    const attachmentAttributeNames = this.#getAttributeNamesAttachment()

    /**
     * Mark all attachments for deletion
     */
    return Promise.allSettled(
      attachmentAttributeNames.map((name) => {
        if (this.#model.$attributes[name]) {
          const attachments = this.#getAttachmentsByAttributeName(name)
          for (let i = 0; i < attachments.length; i++) {
            this.#model.$attachments.detached.push(attachments[i])
          }
        }
      })
    )
  }

  get model() {
    return this.#model
  }

  getAttachments(options: { attributeName: string, requiredOriginal?: boolean }) {
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
    return [
      this.#model.$attributes[name] as AttachmentType
    ]
  }

  #getOriginalAttachmentsByAttributeName(name: string): AttachmentType[] {
    if (Array.isArray(this.#model.$original[name])) {
      return this.#model.$original[name] as AttachmentType[]
    }
    return [
      this.#model.$original[name] as AttachmentType
    ]
  }

  #getOptionsByAttributeName(name: string): LucidOptions {
    return this.#model.constructor.prototype[optionsSym]?.[name]
  }

  #getAttributeNamesAttachment() {
    return Object.keys(this.#model.$attributes).filter((attr) => {
      const value = this.#model.$attributes[attr]
      return value instanceof Attachment || (Array.isArray(value) && value.every(item => item instanceof Attachment))
    })
  }

  #getDirtyAttributeNamesAttachment() {
    return Object.keys(this.#model.$dirty).filter((attr) => {
      const dirtyValue = this.#model.$dirty[attr]
      const originalValue = this.#model.$original[attr]

      const isDirtyAttachment = dirtyValue instanceof Attachment || (Array.isArray(dirtyValue) && dirtyValue.every(item => item instanceof Attachment))
      const isOriginalAttachment = originalValue instanceof Attachment || (Array.isArray(originalValue) && originalValue.every(item => item instanceof Attachment))

      return isDirtyAttachment || isOriginalAttachment
    })
  }
}
