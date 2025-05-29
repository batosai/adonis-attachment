/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import os from 'node:os'
import path from 'node:path'
import { $, ExecaError } from 'execa'
import { cuid } from '@adonisjs/core/helpers'
import logger from '@adonisjs/core/services/logger'
import { attachmentManager } from '@jrmc/adonis-attachment'
import { secondsToTimeFormat } from '../utils/helpers.js'
import { FfmpegMetadata } from '../types/metadata.js'

export default class FFmpeg {
  #ffmpegPath: string
  #ffprobePath: string
  #timeout: NodeJS.Timeout | null
  #TIMEOUT: number

  constructor(private input: string) {
    this.#ffmpegPath = 'ffmpeg'
    this.#ffprobePath = 'ffprobe'
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

  async screenshots(options: {
    time: number
  }) {
    const folder = os.tmpdir()
    const filename = `${cuid()}.jpg`
    const { time } = options
    const output = path.join(folder, filename)
    const timestamp = secondsToTimeFormat(time)

    try {
      const { stderr } = await $({
        cancelSignal: this.#createAbortController().signal,
        gracefulCancel: true,
        timeout: this.#TIMEOUT
      })`${this.#ffmpegPath} -y -i ${this.input} -ss ${timestamp} -vframes 1 -q:v 2 ${output}`

      if (stderr.includes('Output file is empty, nothing was encoded')) {
        const durationMatch = stderr.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/)
        if (durationMatch) {
          const videoDuration = durationMatch[1]
          logger.error(`Video is not long enough. Duration: ${videoDuration}, Requested timestamp: ${timestamp}`)
          throw new Error(`Video is not long enough. Duration: ${videoDuration}, Requested timestamp: ${timestamp}`)
        }
      }

      return output
    } catch (error: unknown) {
      if (error instanceof ExecaError) {
        if (error.failed) {
          const stderr = error.stderr as unknown as string
          if (stderr) {
            logger.error(stderr.split('\n').pop())
          }
          throw error
        }
      } else {
        logger.error(error)
        throw error
      }
    }
    finally {
      this.#cleanup()
    }
  }

  async exif(): Promise<FfmpegMetadata> {
    try {
    const { stdout } = await $({
      cancelSignal: this.#createAbortController().signal,
      gracefulCancel: true,
      timeout: this.#TIMEOUT
    })`${this.#ffprobePath} -v quiet -print_format json -show_format -show_streams ${this.input}`

    const metadata = JSON.parse(stdout)
    const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video')
    const audioStream = metadata.streams.find((stream: any) => stream.codec_type === 'audio')

    return {
      types: metadata.streams.map((stream: any) => stream.codec_type),
      width: videoStream?.width,
      height: videoStream?.height,
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      duration: +metadata.format.duration,
        size: +metadata.format.size
      }
    } catch (error) {
      logger.error(error)
      throw error
    }
    finally {
      this.#cleanup()
    }
  }

  async setFfmpegPath(ffmpegPath: string) {
    this.#ffmpegPath = ffmpegPath
  }

  async setFfprobePath(ffprobePath: string) {
    this.#ffprobePath = ffprobePath
  }
}