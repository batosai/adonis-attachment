/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment, Variant } from '../../types/attachment.js'

import attachmentManager from '../../../services/main.js'

export default class VariantPurger {
  #filters?: { variants?: string[] }

  constructor(filters?: { variants?: string[] }) {
    this.#filters = filters
  }

  async purge(attachments: Attachment[]): Promise<void> {
    const variantsToRemove = this.#getVariantsToRemove(attachments)

    await Promise.all(
      variantsToRemove.map(variant => attachmentManager.remove(variant))
    )

    this.#updateAttachmentVariants(attachments)
  }

  #getVariantsToRemove(attachments: Attachment[]): Variant[] {
    const variants: Variant[] = []

    attachments.forEach(attachment => {
      if (attachment.variants) {
        attachment.variants.forEach(variant => {
          if (this.#shouldRemoveVariant(variant)) {
            variants.push(variant)
          }
        })
      }
    })

    return variants
  }

  #updateAttachmentVariants(attachments: Attachment[]) {
    attachments.forEach(attachment => {
      if (attachment.variants) {
        attachment.variants = this.#filterVariants(attachment.variants)
      }
    })
  }

  #shouldRemoveVariant(variant: Variant): boolean {
    return this.#filters?.variants === undefined ||
           this.#filters.variants.includes(variant.key)
  }

  #filterVariants(variants: Variant[]): Variant[] {
    if (this.#filters?.variants === undefined) {
      return []
    }
    return variants.filter(variant => !this.#filters!.variants!.includes(variant.key))
  }
}