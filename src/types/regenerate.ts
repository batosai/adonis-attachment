import type { AttachmentVariants } from '@jrmc/adonis-attachment'

export type RegenerateOptions = {
  attributes?: string[],
  variants?: (keyof AttachmentVariants)[]
}
