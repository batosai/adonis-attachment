import type { AttachmentManager } from '../src/sources/attachment_manager.js'

import app from '@adonisjs/core/services/app'

class AttachmentManagerService {
  #manager: Promise<AttachmentManager> | undefined

  createFromBuffer(...args: Parameters<AttachmentManager['createFromBuffer']>): ReturnType<AttachmentManager['createFromBuffer']> {
    return this.#resolve().then((manager) => manager.createFromBuffer(...args))
  }

  createFromBase64(...args: Parameters<AttachmentManager['createFromBase64']>): ReturnType<AttachmentManager['createFromBase64']> {
    return this.#resolve().then((manager) => manager.createFromBase64(...args))
  }

  createFromPath(...args: Parameters<AttachmentManager['createFromPath']>): ReturnType<AttachmentManager['createFromPath']> {
    return this.#resolve().then((manager) => manager.createFromPath(...args))
  }

  createFromStream(...args: Parameters<AttachmentManager['createFromStream']>): ReturnType<AttachmentManager['createFromStream']> {
    return this.#resolve().then((manager) => manager.createFromStream(...args))
  }

  createFromUrl(...args: Parameters<AttachmentManager['createFromUrl']>): ReturnType<AttachmentManager['createFromUrl']> {
    return this.#resolve().then((manager) => manager.createFromUrl(...args))
  }

  createFromFile(...args: Parameters<AttachmentManager['createFromFile']>): ReturnType<AttachmentManager['createFromFile']> {
    return this.#resolve().then((manager) => manager.createFromFile(...args))
  }

  createFromFiles(...args: Parameters<AttachmentManager['createFromFiles']>): ReturnType<AttachmentManager['createFromFiles']> {
    return this.#resolve().then((manager) => manager.createFromFiles(...args))
  }

  #resolve(): Promise<AttachmentManager> {
    if (!app) {
      throw new Error('attachmentManager requires a booted AdonisJS application')
    }

    this.#manager ??= new Promise((resolve, reject) => {
      app.booted(async () => {
        try {
          resolve((await app.container.make('jrmc.attachment.manager')) as AttachmentManager)
        } catch (error) {
          reject(error)
        }
      })
    })

    return this.#manager
  }
}

export default new AttachmentManagerService() as unknown as AttachmentManager
