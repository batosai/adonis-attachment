/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment, Variant, LucidOptions } from '../../types/attachment.js'
import type { Converter } from '../../types/converter.js'
import type { Input } from '../../types/input.js'

import logger from '@adonisjs/core/services/logger'
import attachmentManager from '../../../services/main.js'
import { streamToTempFile } from '../../utils/helpers.js'

export default class VariantGeneratorService {
  async generate({
    attachments,
    options,
    filters,
  }: {
    attachments: Attachment[]
    options: LucidOptions
    filters?: { variants?: string[] }
  }): Promise<Variant[]> {
    const variants: Variant[] = []
    const variantKeys = this.#getVariantKeysToProcess(options, filters)

    for (const key of variantKeys) {
      const converter = await this.#getConverter(key)
      if (!converter) continue

      for (const attachment of attachments) {
        const variant = await this.generateVariant({ key, attachment, converter })
        if (variant) {
          variants.push(variant)
        }
      }
    }

    return variants
  }

  async generateVariant({
    key,
    attachment,
    converter,
  }: {
    key: string
    attachment: Attachment
    converter: Converter
  }): Promise<Variant | null> {
    try {
      const input = await this.#prepareInput(attachment)
      const output = await this.#convertFile(input, converter)

      if (!output) {
        // throw new errors.E_CANNOT_PATH_BY_CONVERTER()
        logger.warn(`Converter returned no output for key: ${key}`)
        return null
      }

      const variant = await attachment.createVariant(key, output)
      await this.#processBlurhash(variant, converter)
      await attachmentManager.write(variant)

      return variant
    } catch (error) {
      logger.error(`Failed to generate variant ${key} for attachment: ${error.message}`)
      return null
    }
  }

  #getVariantKeysToProcess(options: LucidOptions, filters?: { variants?: string[] }): string[] {
    if (!options.variants) return []

    return options.variants.filter(
      (key) => filters?.variants === undefined || filters.variants.includes(key)
    )
  }

  async #getConverter(key: string): Promise<Converter | null> {
    try {
      return (await attachmentManager.getConverter(key)) as Converter
    } catch (error) {
      logger.error(`Failed to get converter for key ${key}: ${error.message}`)
      return null
    }
  }

  async #prepareInput(attachment: Attachment): Promise<Input> {
    if (attachment.input) {
      return attachment.input
    }

    const stream = await attachment.getStream()
    return await streamToTempFile(stream)
  }

  async #convertFile(input: Input, converter: Converter): Promise<Input | undefined> {
    if (!converter.handle) {
      throw new Error('Converter handle method is required')
    }

    if (!converter.options) {
      throw new Error('Converter options are required')
    }

    return await converter.handle({
      input,
      options: converter.options,
    })
  }

  async #processBlurhash(variant: Variant, converter: Converter): Promise<void> {
    const blurhashConfig = converter.options?.blurhash

    if (!blurhashConfig) return

    const shouldGenerate =
      typeof blurhashConfig === 'boolean' ? blurhashConfig : blurhashConfig.enabled === true

    if (!shouldGenerate) return

    try {
      const options = typeof blurhashConfig !== 'boolean' ? blurhashConfig : undefined
      await variant.generateBlurhash(options)
    } catch (error) {
      logger.error(`Blurhash generation failed: ${error.message}`)
    }
  }
}
