import type { RowWithAttachment } from '../types/mixin.js'
import type { Attachment as AttachmentType, LucidOptions } from '../types/attachment.js'
import type { Record as RecordImplementation } from '../types/service.js'
import type { RegenerateOptions } from '../types/regenerate.js'

import attachmentManager from '../../services/main.js'
import { defaultStateAttributeMixin } from '../utils/default_values.js'
import { Attachment } from '../attachments/attachment.js'
import { optionsSym } from '../utils/symbols.js'
import { ConverterManager } from '../converter_manager.js'
import { E_CANNOT_CREATE_VARIANT } from '../errors.js'

export default class Record implements RecordImplementation {
  #row: RowWithAttachment

  constructor(row: RowWithAttachment) {
    this.#row = row

    if (!this.#row.$attachments) {
      /**
       * Empty previous $attachments
       */
      this.#row.$attachments = structuredClone(defaultStateAttributeMixin)
    }
  }

  /**
   * During commit, we should cleanup the old detached files
   */
  async commit(): Promise<void> {
    await Promise.allSettled(
      this.#row.$attachments.detached.map((attachment: AttachmentType) =>
        attachmentManager.remove(attachment)
      )
    )
  }

  /**
   * During rollback we should remove the attached files.
   */
  async rollback(): Promise<void> {
    await Promise.allSettled(
      this.#row.$attachments.attached.map((attachment: AttachmentType) =>
        attachmentManager.remove(attachment)
      )
    )
  }

  async persist(): Promise<void> {
    const attachmentAttributeNames = this.#getDirtyAttributeNamesOfAttachment()

    /**
     * Persist attachments before saving the row to the database. This
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
        this.#row.$attachments.dirtied.push(name)

        for (let i = 0; i < newAttachments.length; i++) {
          if (originalAttachments.includes(newAttachments[i])) {
            continue
          }

          /**
           * If there is a new file and its local then we must save this
           * file.
           */
          if (newAttachments[i]) {
            newAttachments[i].setOptions(options).makeFolder(this.#row)
            this.#row.$attachments.attached.push(newAttachments[i])

            /**
             * Also write the file to the disk right away
             */
            await attachmentManager.write(newAttachments[i])
          }
        }
      })
    )
  }

  async transaction(options = { enabledRollback: true }): Promise<void> {
    try {
      if (this.#row.$trx) {
        this.#row.$trx.after('commit', () => this.commit())
        if (options.enabledRollback) {
          this.#row.$trx.after('rollback', () => this.rollback())
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

        if (this.#row.$attributes[name]) {
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
    /* this.#row.$dirty is not avalable in afterSave hooks */
    const attachmentAttributeNames = this.#row.$attachments.dirtied

    /**
     * For all properties Attachment
     * Launch async generation variants
     */

    for await (const name of attachmentAttributeNames) {
      const record = this
      attachmentManager.queue.push({
        name: `${this.#row.constructor.name}-${name}`,
        async run() {
          try {
            const converterManager = new ConverterManager({
              record,
              attributeName: name,
              options: record.#getOptionsByAttributeName(name),
            })
            await converterManager.run()
          } catch (err) {
            throw new E_CANNOT_CREATE_VARIANT([err.message])
          }
        },
      })
    }
  }

  async regenerateVariants(options: RegenerateOptions = {}) {
    let attachmentAttributeNames

    if (options.attributes?.length) {
      attachmentAttributeNames = options.attributes
    } else {
      attachmentAttributeNames = this.#getAttributeNamesOfAttachment()
    }

    for await (const name of attachmentAttributeNames) {
      const record = this
      attachmentManager.queue.push({
        name: `${this.#row.constructor.name}-${name}`,
        async run() {
          try {
            const converterManager = new ConverterManager({
              record,
              attributeName: name,
              options: record.#getOptionsByAttributeName(name),
              filters: {
                variants: options.variants
              }
            })
            await converterManager.run()
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

        if (this.#row.$dirty[name] === null) {
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
          this.#row.$attachments.detached.push(attachments[i])
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
          this.#row.$attachments.detached.push(attachments[i])
        }
      })
    )
  }

  get row() {
    return this.#row
  }

  getAttachments(options: { attributeName: string, requiredOriginal?: boolean, requiredDirty?: boolean }) {
    let attachments

    if (options.requiredOriginal) {
      attachments = this.#getOriginalAttachmentsByAttributeName(options.attributeName)
    } else if (options.requiredDirty) {
      attachments = this.#getDirtyAttachmentsByAttributeName(options.attributeName)
    } else {
      attachments = this.#getAttachmentsByAttributeName(options.attributeName)
    }

    const opts = this.#getOptionsByAttributeName(options.attributeName)
    attachments.map((attachment) => attachment.setOptions(opts).makeFolder(this.#row))

    return attachments
  }

  #getAttachmentsByAttributeName(name: string): AttachmentType[] {
    if (Array.isArray(this.#row.$attributes[name])) {
      return this.#row.$attributes[name] as AttachmentType[]
    }
    return [this.#row.$attributes[name] as AttachmentType]
  }

  #getOriginalAttachmentsByAttributeName(name: string): AttachmentType[] {
    if (Array.isArray(this.#row.$original[name])) {
      return this.#row.$original[name] as AttachmentType[]
    }
    return [this.#row.$original[name] as AttachmentType]
  }

  #getDirtyAttachmentsByAttributeName(name: string): AttachmentType[] {
    if (Array.isArray(this.#row.$dirty[name])) {
      return this.#row.$dirty[name] as AttachmentType[]
    }
    return [this.#row.$dirty[name] as AttachmentType]
  }

  #getOptionsByAttributeName(name: string): LucidOptions {
    return this.#row.constructor.prototype[optionsSym]?.[name]
  }

  #getAttributeNamesOfAttachment() {
    return Object.keys(this.#row.$attributes).filter((name) => {
      const value = this.#row.$attributes[name]
      return (
        value instanceof Attachment ||
        (Array.isArray(value) && value.every((item) => item instanceof Attachment))
      )
    })
  }

  #getDirtyAttributeNamesOfAttachment() {
    return Object.keys(this.#row.$dirty).filter((name) => {
      const dirtyValue = this.#row.$dirty[name]
      const originalValue = this.#row.$original[name] // if dirtyValue is null, check original type

      const isDirtyAttachment =
        dirtyValue instanceof Attachment ||
        (Array.isArray(dirtyValue) &&
          dirtyValue.length &&
          dirtyValue.every((item) => item instanceof Attachment))

      const isOriginalAttachment =
        originalValue instanceof Attachment ||
        (Array.isArray(originalValue) &&
          originalValue.length &&
          originalValue.every((item) => item instanceof Attachment))

      return isDirtyAttachment || isOriginalAttachment
    })
  }
}
