/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import {
  defineConfig,
  type AttachmentPersistenceOptions,
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
    thumbnail: { width: 320 },
    preview: { width: 640 },
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

void validVariants
void invalidVariants

export {}
