/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export type Exif = {
  orientation?: {
    value: number
    description?: string
  }
  date?: string
  host?: string
  gps?: {
    latitude?: number
    longitude?: number
    altitude?: number
  }
  dimension?: {
    width: number
    height: number
  }
  duration?: number
  videoCodec?: string
  audioCodec?: string
  pages?: number
  version?: string
}

export type Meta = {
  extname: string
  mimeType: string
  size: number
}

export type Input = Buffer | string
