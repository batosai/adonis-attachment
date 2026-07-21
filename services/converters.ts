/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import app from '@adonisjs/core/services/app'

import type { VariantConverter } from '../src/variants/variant_converter.js'
import type { VariantConverterRegistry } from '../src/converters/configured_variant_converter_registry.js'

const attachmentConverters: VariantConverterRegistry = {
  async keys() {
    return (await app.container.make('jrmc.attachment.converters') as VariantConverterRegistry).keys()
  },
  async get(key: string): Promise<VariantConverter | undefined> {
    return (await app.container.make('jrmc.attachment.converters') as VariantConverterRegistry).get(key)
  },
}

export default attachmentConverters
