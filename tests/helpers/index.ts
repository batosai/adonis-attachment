/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'

import { readFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'

export const BASE_URL = new URL('../tmp/', import.meta.url)

export async function makeAttachment() {
  const attachmentManager = await app.container.make('jrmc.attachment')
  const buffer = await readFile(app.makePath('../fixtures/images/img.jpg'))
  return attachmentManager.createFromBuffer(buffer, 'avatar.jpg')
}

export function getCurrentDateFormatted() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}/${month}`
}
