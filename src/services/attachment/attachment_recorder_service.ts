/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { RowWithAttachment } from '../../types/mixin.js'
import type { Attachment as AttachmentType } from '../../types/attachment.js'
import type { RecordWithAttachment as RecordWithAttachmentImplementation } from '../../types/service.js'
import type { RegenerateOptions } from '../../types/regenerate.js'
import type { TransactionOptions } from './attachment_transaction_service.js'

import { defaultStateAttributeMixin } from '../../utils/default_values.js'
import { AttachmentTransactionService } from './attachment_transaction_service.js'
import { AttachmentPersisterService } from './attachment_persister_service.js'
import { AttachmentVariantService } from './attachment_variant_service.js'
import { AttachmentDetachmentService } from './attachment_detachment_service.js'
import { AttachmentUtils } from './attachment_utils.js'

export default class AttachmentRecorderService implements RecordWithAttachmentImplementation {
  #row: RowWithAttachment
  #transactionService = new AttachmentTransactionService()
  #persistenceService = new AttachmentPersisterService()
  #variantService = new AttachmentVariantService()
  #detachmentService = new AttachmentDetachmentService()

  constructor(row: RowWithAttachment) {
    this.#row = row
    this.#initializeAttachments()
  }

  /**
   * Initialize attachments state if not exists
   */
  #initializeAttachments(): void {
    if (!this.#row.$attachments) {
      this.#row.$attachments = structuredClone(defaultStateAttributeMixin)
    }
  }

  /**
   * During commit, we should cleanup the old detached files
   */
  async commit(): Promise<void> {
    await this.#transactionService.commit(this.#row.$attachments.detached)
  }

  /**
   * During rollback we should remove the attached files.
   */
  async rollback(): Promise<void> {
    await this.#transactionService.rollback(this.#row.$attachments.attached)
  }

  /**
   * Persist attachments before saving the row to the database
   */
  async persist(): Promise<void> {
    await this.#persistenceService.persistAttachments(this)
  }

  /**
   * Handle transaction lifecycle
   */
  async transaction(options: TransactionOptions = { enabledRollback: true }): Promise<void> {
    await this.#transactionService.handleTransaction(this, options)
  }

  /**
   * Pre-compute URLs for all attachments
   */
  async preComputeUrl(): Promise<void> {
    await this.#persistenceService.preComputeUrls(this)
  }

  /**
   * Set key IDs for all attachments
   */
  async setKeyId(): Promise<void> {
    await this.#persistenceService.setKeyIds(this)
  }

  /**
   * Generate variants for all dirty attachment attributes
   */
  async generateVariants(): Promise<void> {
    await this.#variantService.generateVariants(this)
  }

  /**
   * Regenerate variants with specific options
   */
  async regenerateVariants(options: RegenerateOptions = {}): Promise<void> {
    await this.#variantService.regenerateVariants(this, options)
  }

  /**
   * Detach dirty attachments (mark for deletion)
   */
  async detach(): Promise<void> {
    await this.#detachmentService.detach(this)
  }

  /**
   * Detach all attachments (mark all for deletion)
   */
  async detachAll(): Promise<void> {
    await this.#detachmentService.detachAll(this)
  }

  /**
   * Get row instance
   */
  get row(): RowWithAttachment {
    return this.#row
  }

  /**
   * Get attachments with specific options
   */
  getAttachments(options: {
    attributeName: string
    requiredOriginal?: boolean
    requiredDirty?: boolean
  }): AttachmentType[] {
    let attachments: AttachmentType[]

    if (options.requiredOriginal) {
      attachments = AttachmentUtils.getOriginalAttachmentsByAttributeName(this.#row, options.attributeName)
    } else if (options.requiredDirty) {
      attachments = AttachmentUtils.getDirtyAttachmentsByAttributeName(this.#row, options.attributeName)
    } else {
      attachments = AttachmentUtils.getAttachmentsByAttributeName(this.#row, options.attributeName)
    }

    const opts = AttachmentUtils.getOptionsByAttributeName(this.#row, options.attributeName)
    attachments.forEach((attachment) => {
      if (attachment) {
        attachment.setOptions(opts).makeFolder(this.#row)
      }
    })

    return attachments
  }
}
