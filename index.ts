import attachmentManager from './services/main.js'

export { configure } from './configure.js'
export { Attachment } from './src/attachments/attachment.js'
export { attachment } from './src/decorators/attachment.js'
export { defineConfig } from './src/define_config.js'
export { Attachmentable } from './src/mixins/attachmentable.js'
export * as errors from './src/errors.js'
export { attachmentManager }
export { type AttachmentVariants } from './src/types/config.js'
