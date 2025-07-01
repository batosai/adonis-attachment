// Main service
export { default as AttachmentRecordService } from './attachment_record_service.js'

// Specialized services
export { AttachmentTransactionService } from './attachment_transaction_service.js'
export { AttachmentPersistenceService } from './attachment_persistence_service.js'
export { AttachmentVariantService } from './attachment_variant_service.js'
export { AttachmentDetachmentService } from './attachment_detachment_service.js'

// Utilities
export { AttachmentUtils } from './attachment_utils.js'

// Types
export type { TransactionOptions } from './attachment_transaction_service.js'
export type { VariantOptions } from './attachment_variant_service.js'
