import type { AttachmentVariants } from '@jrmc/adonis-attachment'
import type { AttachmentAttributes } from './attachment.js'

export type RegenerateOptions = {
  attributes?: string[],
  variants?: (keyof AttachmentVariants)[]
}
