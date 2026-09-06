import {
  defineConfig,
  type AttachmentQueueConnections,
  type AttachmentStorage,
  type InferConverters,
  type NamedAttachmentQueueConfig,
} from '../index.js'
import { Env } from '@adonisjs/core/env'

const storage: AttachmentStorage = {
  async write() {},
  async read() { return new Uint8Array() },
  async remove() {},
}

const connections = {
  memory: { driver: 'memory', concurrency: 2 },
  custom: async (app) => {
    app.config.get('attachment')
    return { async enqueue() {} }
  },
} satisfies AttachmentQueueConnections

const selected: 'memory' | 'custom' = Math.random() > 0.5 ? 'memory' : 'custom'
const config = defineConfig({
  storage,
  queue: { default: selected, connections },
  converters: { thumbnail: { resize: 320 } },
})

async function environmentConfig() {
  const env = await Env.create(new URL('../', import.meta.url), {
    ATTACHMENT_QUEUE: Env.schema.enum.optional(['memory', 'custom'] as const),
  })
  return defineConfig({
    storage,
    queue: { default: env.get('ATTACHMENT_QUEUE', 'memory'), connections },
  })
}

const key: keyof InferConverters<typeof config> = 'thumbnail'
// @ts-expect-error Queue inference must not widen converter keys.
const invalidKey: keyof InferConverters<typeof config> = 'missing'

defineConfig({
  storage,
  queue: {
    // @ts-expect-error Default must be a declared connection key, not inferred from this value.
    default: 'missing',
    connections: { memory: { driver: 'memory' } },
  },
})

defineConfig({
  storage,
  queue: {
    // @ts-expect-error An unvalidated string must be narrowed, e.g. with Env.schema.enum.
    default: 'memory' as string,
    connections,
  },
})

const invalidConfig: NamedAttachmentQueueConfig<typeof connections> = {
  // @ts-expect-error Explicitly typed configurations also validate the selected key.
  default: 'missing',
  connections,
}

void key
void invalidKey
void invalidConfig
void environmentConfig
