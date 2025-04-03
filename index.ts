import attachmentManager from './services/main.js'
import RegenerateService from './services/regenerate_service.js'

export { configure } from './configure.js'
export { Attachment } from './src/attachments/attachment.js'
export { attachment } from './src/decorators/attachment.js'
export { attachments } from './src/decorators/attachment.js'
export { defineConfig } from './src/define_config.js'
export * as errors from './src/errors.js'
export { attachmentManager }
export { RegenerateService }
export { type AttachmentVariants } from './src/types/config.js'
