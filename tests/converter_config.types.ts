/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import {
  Converter,
  defineConfig,
  type AttachmentPersistenceOptions,
  type ConverterAttributes,
  type ConverterConfig,
  type ConverterOptions,
  type InferConverters,
} from '../index.js'

type Assert<Value extends true> = Value
type IsEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false

const attachmentConfig = defineConfig({
  storage: {
    async write() {},
    async read() {
      return new Uint8Array()
    },
    async remove() {},
  },
  converters: {
    thumbnail: {
      resize: { width: 320, fit: 'cover', background: '#ffffff' },
      format: { format: 'webp', options: { quality: 82, effort: 4 } },
    },
    preview: { resize: 640, format: 'tiff' },
    config: {},
    decorator: {},
    manager: {},
  },
})

type _converterKeysArePreserved = Assert<
  IsEqual<
    keyof InferConverters<typeof attachmentConfig>,
    'thumbnail' | 'preview' | 'config' | 'decorator' | 'manager'
  >
>

declare module '../index.js' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}

const validVariants: AttachmentPersistenceOptions = { variants: ['thumbnail', 'preview'] }
// @ts-expect-error Unknown keys must be rejected after module augmentation.
const invalidVariants: AttachmentPersistenceOptions = { variants: ['unknown'] }

const invalidFormat: ConverterConfig = {
  // @ts-expect-error Unsupported Sharp formats are rejected.
  format: 'bmp',
}

const invalidWebpOptions: ConverterConfig = {
  format: {
    format: 'webp',
    // @ts-expect-error PNG options cannot be used for WebP.
    options: { compressionLevel: 9 },
  },
}

type WatermarkOptions = ConverterOptions & {
  label: string
  opacity?: number
}

class WatermarkConverter extends Converter<WatermarkOptions> {
  async handle({ body, options }: ConverterAttributes<WatermarkOptions>) {
    return {
      body,
      fileName: `${options.label}.png`,
      mimeType: 'image/png',
    }
  }
}

const watermarkConfig = {
  converter: async () => ({ default: WatermarkConverter }),
  label: 'logo',
  options: { opacity: 0.5 },
} satisfies ConverterConfig<WatermarkOptions>

void validVariants
void invalidVariants
void invalidFormat
void invalidWebpOptions
void watermarkConfig

export {}
