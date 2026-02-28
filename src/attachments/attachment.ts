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
import { metaFromBuffer, metaFromFile } from '../adapters/meta.js'
import { LucidRow } from '@adonisjs/lucid/types/model'

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
   * Methods
   */

  async createVariant(
    key: string,
    input: Input,
    options?: { basePath?: string; ignoreFolder?: boolean }
  ): Promise<Variant> {
    let meta
    let folder: string
    if (Buffer.isBuffer(input)) {
      meta = await metaFromBuffer(input)
    } else {
      meta = await metaFromFile(input, this.name)
    }

    if (options?.basePath && !options?.ignoreFolder) {
      folder = path.join(options.basePath, this.folder!, this.name)
    } else if (options?.basePath && options?.ignoreFolder) {
      folder = path.join(options.basePath, this.name)
    } else if (options?.ignoreFolder) {
      folder = this.name
    } else {
      folder = path.join(this.folder!, 'variants', this.name)
    }

    const attributes = {
      ...meta,
      key,
      folder,
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
    return this.variants?.find((v) => v.key === variantName) ?? null
  }

  async getUrl(variantName?: string) {
    if (variantName) {
      const variant = this.getVariant(variantName)
      if (variant) {
        variant.setOptions(this.options!)
        const url = await variant.getUrl()
        if (url) {
          return url
        }
      }
    }

    return super.getUrl()
  }

  async getSignedUrl(
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
        const url = variant.getSignedUrl(options)
        if (url) {
          return url
        }
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
   * Actions
   */

  async preComputeUrl() {
    if (this.options?.preComputeUrl === false) {
      return
    }

    await this.computeUrl()

    if (this.variants) {
      for (const key in this.variants) {
        if (Object.prototype.hasOwnProperty.call(this.variants, key)) {
          await this.variants[key].computeUrl()
        }
      }
    }
  }

  async makeName(record?: LucidRow, attributeName?: string) {
    return super.makeName(record, attributeName, this.originalName)
  }

  async moveFileForDelete() {
    if (this.options && this.options.rename !== true) {
      const originalPath = this.path
      this.name = `${this.name}.trash`
      const trashPath = this.path
      this.originalPath = trashPath

      await this.getDisk().move(originalPath, trashPath)
    }
  }

  async rollbackMoveFileForDelete() {
    if (this.options && this.options.rename !== true) {
      const trashPath = this.path
      this.name = this.name.replace('.trash', '')
      const originalPath = this.path
      this.originalPath = originalPath

      await this.getDisk().move(trashPath, originalPath)
    }
  }

  async remove() {
    await super.remove()

    if (this.variants) {
      const variantPath = this.variants[0].folder

      try {
        await this.getDisk().deleteAll(variantPath) // not compatible Minio, necessary for fs as not to leave an empty directory
      } catch (error) {
        for (const key in this.variants) {
          if (Object.prototype.hasOwnProperty.call(this.variants, key)) {
            this.variants[key].remove()
          }
        }
      }
    }
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
      keyId: this.getKeyId(),
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
          blurhash: v.blurhash,
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
