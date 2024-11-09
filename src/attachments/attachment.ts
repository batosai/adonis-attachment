/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { DriveService, SignedURLOptions } from '@adonisjs/drive/types'
import type {
  AttachmentAttributes,
  Attachment as AttachmentInterface,
  LucidOptions,
} from '../types/attachment.js'
import type { Input } from '../types/input.js'

import path from 'node:path'
import { AttachmentBase } from './attachment_base.js'
import { Variant } from './variant_attachment.js'
import { createAttachmentAttributes } from '../utils/helpers.js'

export class Attachment extends AttachmentBase implements AttachmentInterface {
  originalName: string
  variants?: Variant[]

  constructor(drive: DriveService, attributes: AttachmentAttributes, input?: Input) {
    super(drive, attributes, input)

    this.originalName = attributes.originalName

    if (attributes.variants) {
      this.variants = []

      attributes.variants.forEach((v) => {
        const variant = new Variant(this.drive, v)
        this.variants!.push(variant)
      })
    }
  }

  /**
   * Getters
   */

  get name() {
    if (this.options && this.options.rename === false) {
      return this.originalName
    }

    return super.name
  }

  /**
   * Methods
   */

  async createVariant(key: string, input: Input): Promise<Variant> {
    const attributes = {
      ...(await createAttachmentAttributes(input)),
      key,
      folder: path.join(this.options!.folder!, 'variants', this.name),
    }

    const variant = new Variant(this.drive, attributes, input)
    variant.setOptions(this.options!)

    if (this.variants === undefined) {
      this.variants = []
    }
    this.variants.push(variant)

    return variant
  }

  getVariant(variantName: string) {
    return this.variants?.find((v) => v.key === variantName)
  }

  getUrl(variantName?: string) {
    if (variantName) {
      const variant = this.getVariant(variantName)
      if (variant) {
        variant.setOptions(this.options!)
        return variant.getUrl()
      }
    }

    return super.getUrl()
  }

  getSignedUrl(
    variantNameOrOptions?: string | SignedURLOptions,
    signedUrlOptions?: SignedURLOptions
  ) {
    let variantName: string | undefined
    let options: SignedURLOptions | undefined = signedUrlOptions

    if (typeof variantNameOrOptions === 'string') {
      variantName = variantNameOrOptions
    } else if (variantNameOrOptions && !signedUrlOptions) {
      options = variantNameOrOptions
    }

    if (variantName) {
      const variant = this.getVariant(variantName)
      if (variant) {
        variant.setOptions(this.options!)
        return variant.getSignedUrl(options)
      }
    }

    return super.getSignedUrl(options)
  }

  setOptions(options: LucidOptions) {
    this.options = {
      ...this.options,
      ...options,
    }

    if (this.variants) {
      this.variants.forEach((v) => {
        v.setOptions({
          ...this.options,
          variants: [],
        })
      })
    }

    return this
  }

  /**
   *
   */

  toObject(): AttachmentAttributes {
    const variants = this.variants?.map((v) => v.toObject())

    return {
      ...super.toObject(),
      originalName: this.originalName,
      variants,
    }
  }

  toJSON(): Object {
    const data: any = {
      name: this.name,
      originalName: this.originalName,
      size: this.size,
      extname: this.extname,
      mimeType: this.mimeType,
      meta: this.meta,
    }

    if (this.variants) {
      this.variants!.map(async (v) => {
        data[v.key] = {
          name: v.name,
          extname: v.extname,
          mimeType: v.mimeType,
          meta: v.meta,
          size: v.size,
        }
      })
    }

    if (this.url) {
      data.url = this.url
    }

    if (this.variants) {
      this.variants!.map(async (v) => {
        if (v.url) {
          data[v.key].url = v.url
        }
      })
    }

    return data
  }
}
