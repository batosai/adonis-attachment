/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import app from '@adonisjs/core/services/app'

import type { Attachment } from '../src/core/attachment.js'
import type { AttachmentService } from '../src/core/attachment_service.js'
import type { AttachmentSignedUrlOptions } from '../src/core/storage.js'

class AttachmentServiceProxy {
  #service: Promise<AttachmentService> | undefined

  getUrl(attachment: Attachment): Promise<string | undefined> {
    return this.#resolve().then((service) => service.getUrl(attachment))
  }

  getSignedUrl(
    attachment: Attachment,
    options?: AttachmentSignedUrlOptions
  ): Promise<string | undefined> {
    return this.#resolve().then((service) => service.getSignedUrl(attachment, options))
  }

  preComputeUrl(attachment: Attachment): Promise<Attachment> {
    return this.#resolve().then((service) => service.preComputeUrl(attachment))
  }

  #resolve(): Promise<AttachmentService> {
    if (!app) {
      throw new Error('attachmentService requires a booted AdonisJS application')
    }

    this.#service ??= new Promise((resolve, reject) => {
      app.booted(async () => {
        try {
          resolve((await app.container.make('jrmc.attachment')) as AttachmentService)
        } catch (error) {
          reject(error)
        }
      })
    })

    return this.#service
  }
}

export default new AttachmentServiceProxy() as Pick<
  AttachmentService,
  'getUrl' | 'getSignedUrl' | 'preComputeUrl'
>
