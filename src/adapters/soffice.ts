/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import os from 'node:os'
import path from 'node:path'
import { $ } from 'execa'
import logger from '@adonisjs/core/services/logger'
import { attachmentManager } from '@jrmc/adonis-attachment'

export default class Soffice {
  #sofficePath: string
  #timeout: NodeJS.Timeout | null
  #TIMEOUT: number

  constructor(private input: string) {
    this.#sofficePath = 'soffice'
    this.#timeout = null
    this.#TIMEOUT = attachmentManager.getConfig().timeout || 30000
  }

  #createAbortController() {
    this.#cleanup()
    const controller = new AbortController()
    this.#timeout = setTimeout(() => {
      controller.abort()
    }, this.#TIMEOUT)

    return controller
  }

  #cleanup() {
    if (this.#timeout) {
      clearTimeout(this.#timeout)
    }
  }

  async convert() {
    const output = os.tmpdir()
    try {
      const { stderr } = await $({
        cancelSignal: this.#createAbortController().signal,
        gracefulCancel: true,
        timeout: this.#TIMEOUT
      })`${this.#sofficePath} --headless --writer --convert-to jpg ${this.input} --outdir ${output}`

      if (stderr) {
        logger.error('Error while converting Document to Image:', stderr)
        throw stderr
      }

      const ext = path.extname(this.input)
      const baseName = path.basename(this.input, ext)
      const imagePath = path.join(output, baseName + '.jpg')

      return imagePath
    } catch (error) {
      logger.error('Error while converting Document to Image:', error)
      throw error
    }
    finally {
      this.#cleanup()
    }
  }

  async setSofficePath(sofficePath: string) {
    this.#sofficePath = sofficePath
  }
}