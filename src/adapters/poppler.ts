
/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import os from 'node:os'
import path from 'node:path'
import { $ } from 'execa'
import { cuid } from '@adonisjs/core/helpers'
import logger from '@adonisjs/core/services/logger'
import { PopplerMetadata } from '../types/metadata.js'
import { DateTime } from 'luxon'

export default class Poppler {
  private pdfToPpmPath: string
  private pdfInfoPath: string
  private timeout: NodeJS.Timeout | null
  #TIMEOUT: number

  constructor(private input: string) {
    this.pdfToPpmPath = 'pdftoppm'
    this.pdfInfoPath = 'pdfinfo'
    this.timeout = null
    this.#TIMEOUT = 30000
  }

  #createAbortController() {
    this.#cleanup()
    const controller = new AbortController()
    this.timeout = setTimeout(() => {
      controller.abort()
    }, this.#TIMEOUT)

    return controller
  }

  #cleanup() {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }
  }

  async pdfToPpm(options: {
    page: number,
    dpi: number,
  }) {
    const output = path.join(os.tmpdir(), cuid())
    try {
      await $({
        cancelSignal: this.#createAbortController().signal,
        gracefulCancel: true,
        timeout: this.#TIMEOUT
      })`${this.pdfToPpmPath} -f ${options.page.toString()} -l ${options.page.toString()} -r ${options.dpi.toString()} -jpeg ${this.input} ${output}`

      const pdfInfo = await this.pdfInfo()
      const pageNumberFormat = '0'.repeat(String(pdfInfo.pages).length - String(options.page).length)

      return `${output}-${pageNumberFormat}${options.page}.jpg`
    } catch (error) {
      logger.error('Error while converting PDF to PPM:', error)
      throw error
    }
    finally {
      this.#cleanup()
    }
  }

  async pdfInfo(): Promise<PopplerMetadata> {
    try {
      const { stdout } = await $({
        cancelSignal: this.#createAbortController().signal,
        gracefulCancel: true,
        timeout: this.#TIMEOUT
      })`${this.pdfInfoPath} ${this.input}`

      const metadata: Record<string, string> = {}
      stdout.split('\n').forEach((line: string) => {
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim()
          const value = line.substring(colonIndex + 1).trim()
          if (key && value) {
            metadata[key.toLowerCase()] = value
          }
        }
      })

      const pageSizeMatch = metadata['page size']?.match(/(\d+)\s*x\s*(\d+)/)
      const [width, height] = pageSizeMatch ? [parseInt(pageSizeMatch[1]), parseInt(pageSizeMatch[2])] : [0, 0]

      const fileSizeMatch = metadata['file size']?.match(/(\d+)/)
      const size = fileSizeMatch ? parseInt(fileSizeMatch[1]) : 0

      const version = metadata['pdf version'] || ''

      const pages = parseInt(metadata['pages'] || '0')

      let creationDate = ''
      if (metadata['creationdate']) {
        const dateStr = metadata['creationdate']
        const date = DateTime.fromFormat(dateStr, 'EEE MMM dd HH:mm:ss yyyy z', { zone: 'UTC' })
        console.log('Parsed date:', date.toISO())
        if (date.isValid) {
          creationDate = date.toFormat('yyyy-MM-dd\'T\'HH:mm:ss')
        }
      }

      return {
        size,
        version,
        width,
        height,
        pages,
        creationDate
      }
    } catch (error) {
      logger.error('Error while retrieving metadata:', error)
      throw error
    }
    finally {
      this.#cleanup()
    }
  }

  async setPdfToPpmPath(pdftoppm: string) {
    this.pdfToPpmPath = pdftoppm
  }

  async setPdfInfoPath(pdfinfo: string) {
    this.pdfInfoPath = pdfinfo
  }
}