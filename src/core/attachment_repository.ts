/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'

/**
 * Read boundary used by asynchronous workers. Lucid, another ORM, or no database
 * can implement it according to the application's persistence model.
 */
export interface AttachmentRepository {
  findById(id: string): Promise<Attachment | null>
}
