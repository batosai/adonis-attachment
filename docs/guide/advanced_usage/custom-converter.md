# Custom converter

⚠️ [avalable in v2.4.0](/changelog#_2-4-0)

## Make converter

The converts are stored within the ./app/converters directory. You may create a new converter by running the following command.

```sh
node ace make:converter gif2webp
```

- Form: `singular`
- Suffix: `converter`
- Class name example: `Gif2WebpConverter`
- File name example: `gif_2_webp_converter.ts`

## Samples animate gif to webp

```ts
import type { ConverterAttributes } from '@jrmc/adonis-attachment/types/converter'
import type { Input } from '@jrmc/adonis-attachment/types/input'

import Converter from '@jrmc/adonis-attachment/converters/converter'
import { errors } from '@jrmc/adonis-attachment'
import sharp from 'sharp'

export default class Gif2WebpConverter extends Converter {
  async handle({ input }: ConverterAttributes): Promise<Input> {
    try {
      const sharpImage = sharp(input, { animated: true, pages: -1 })

      const imageMeta = await sharpImage.metadata()
      const { loop, delay } = imageMeta

      const options = {
        webp: {
          loop,
          delay,
        }
      }

      const buffer = await sharpImage
        .withMetadata()
        .webp(options.webp)
        .toBuffer()

      return buffer
    } catch (err) {
      throw new errors.E_CANNOT_CREATE_VARIANT([err.message])
    }
  }
}
```


## Samples video to animate gif

```ts
import type { ConverterAttributes } from '@jrmc/adonis-attachment/types/converter'
import type { Input } from '@jrmc/adonis-attachment/types/input'

import os from 'node:os'
import path from 'node:path'
import fs from 'fs/promises'
import { cuid } from '@adonisjs/core/helpers'
import { errors } from '@jrmc/adonis-attachment'
import Converter from '@jrmc/adonis-attachment/converters/converter'
import ffmpeg from 'fluent-ffmpeg'

export default class Video2GifConverter extends Converter {
  async handle({ input }: ConverterAttributes): Promise<Input> {
    try {
      return await this.videoToGif(ffmpeg, input)
    } catch (err) {
      throw new errors.E_CANNOT_CREATE_VARIANT([err.message])
    }
  }

  async videoToGif(ffmpeg: Function, input: Input) {
    let file = input

    if (Buffer.isBuffer(input)) {
      file = await this.bufferToTempFile(input)
    }

    return new Promise<string>((resolve, reject) => {
      const folder = os.tmpdir()
      const filename = `${cuid()}.png`
      const destination = path.join(folder, filename)


      const ff = ffmpeg(file)

      if (this.binPaths) {
        if (this.binPaths.ffmpegPath) {
          ff.setFfmpegPath(this.binPaths.ffmpegPath)
        }
      }

      ff
      .withOptions([
        '-ss 1',
        `-i ${file}`,
        `-filter_complex [0:v]trim=duration=3;`,
        '-f gif'
      ])
      .on('end', () => {
        resolve(destination)
      })
      .on('error', (err: Error) => {
        reject(err)
      })
      .output(destination)
      .run()
    })
  }

  async bufferToTempFile(input: Buffer) {
    const folder = os.tmpdir()
    const tempFilePath = path.join(folder, `tempfile-${Date.now()}.tmp`)
    await fs.writeFile(tempFilePath, input)
    return tempFilePath
  }
}
```
