import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { RecordWithAttachment as RecordWithAttachmentImplementation } from '../../types/service.js'
import type { RegenerateOptions } from '../../types/regenerate.js'
import logger from '@adonisjs/core/services/logger'
import emitter from '@adonisjs/core/services/emitter'
import attachmentManager from '../../../services/main.js'
import VariantService from '../variant_service.js'
import { AttachmentUtils } from './attachment_utils.js'
import { E_CANNOT_CREATE_VARIANT } from '../../errors.js'

export interface VariantOptions {
  variants?: string[]
}

export class AttachmentVariantService {
  /**
   * Generate variants for all dirty attachment attributes
   */
  async generateVariants(record: RecordWithAttachmentImplementation): Promise<void> {
    /* this.#row.$dirty is not available in afterSave hooks */
    const attachmentAttributeNames = record.row.$attachments.dirtied

    for await (const name of attachmentAttributeNames) {
      if (!record.row.$attributes[name]) {
        continue
      }

      this.#queueVariantGeneration(name, record, {})
    }
  }

  /**
   * Regenerate variants with specific options
   */
  async regenerateVariants(
    record: RecordWithAttachmentImplementation,
    options: RegenerateOptions = {}
  ): Promise<void> {
    let attachmentAttributeNames

    if (options.attributes?.length) {
      attachmentAttributeNames = options.attributes
    } else {
      attachmentAttributeNames = AttachmentUtils.getAttributeNamesOfAttachment(record.row)
    }

    for await (const name of attachmentAttributeNames) {
      if (!record.row.$attributes[name]) {
        continue
      }

      this.#queueVariantGeneration(name, record, { variants: options.variants })
    }
  }

  /**
   * Queue variant generation with error handling
   */
  #queueVariantGeneration(
    name: string,
    record: RecordWithAttachmentImplementation,
    options: VariantOptions
  ): void {
    attachmentManager.queue.push({
      name: `${record.row.constructor.name}-${name}`,
      async run() {
        const model = record.row.constructor as LucidModel

        await attachmentManager.lock
          .createLock(`attachment.${model.table}-${name}`)
          .run(async () => {
            const config = AttachmentUtils.getOptionsByAttributeName(record.row, name)
            const emitterPayload = {
              tableName: model.table,
              attributeName: name,
              variants: config?.variants,
              primary: {
                key: model.primaryKey,
                value: record.row.$primaryKeyValue?.toString() || record.row.$attributes['id'],
              },
            }
            emitter.emit('attachment:variant_started', emitterPayload)
            const variantService = new VariantService({
              record,
              attributeName: name,
              options: config,
              filters: {
                variants: options.variants,
              },
            })
            await variantService.run()
            emitter.emit('attachment:variant_completed', emitterPayload)
          })
      },
    }).onError = (error: any) => {
      this.#handleVariantError(error)
      const config = AttachmentUtils.getOptionsByAttributeName(record.row, name)
      const model = record.row.constructor as LucidModel
      emitter.emit('attachment:variant_failed', {
        tableName: model.table,
        attributeName: name,
        variants: config?.variants,
        primary: {
          key: model.primaryKey,
          value: record.row.$primaryKeyValue?.toString() || record.row.$attributes['id'],
        },
      })
    }
  }

  /**
   * Handle variant generation errors
   */
  #handleVariantError(error: any): void {
    if (error.message) {
      logger.error(error.message)
    } else {
      throw new E_CANNOT_CREATE_VARIANT([error])
    }
  }
}
