/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export type AttachmentEventPayload = {
  tableName: string
  attributeName: string
  primary: {
    key: string
    value: string | number
  },
  variants?: string[],
}
