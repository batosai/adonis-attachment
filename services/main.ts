/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import app from '@adonisjs/core/services/app'
import { AttachmentService } from '../src/types/config.js'

let manager: AttachmentService

await app.booted(async () => {
  manager = await app.container.make('jrmc.attachment')
})

export { manager as default }
