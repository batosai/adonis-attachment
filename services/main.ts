/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import app from '@adonisjs/core/services/app'
import { AttachmentManager } from '../src/attachment_manager.js'

let manager: AttachmentManager

await app.booted(async () => {
  manager = await app.container.make('jrmc.attachment')
})

export { manager as default }
