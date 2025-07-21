import type { HttpContext } from '@adonisjs/core/http'
import type { Converter } from '../types/converter.js'
import type { Attachment, LucidOptions } from '../types/attachment.js'

import path from 'node:path'
import { Readable } from 'node:stream'
import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { attachmentManager } from '@jrmc/adonis-attachment'
import VariantGeneratorService from '../services/variant/variant_generator_service.js'
import VariantPersisterService from '../services/variant/variant_persister_service.js'

type Data = {
  model: string
  attribute: string
  id: string
  options: LucidOptions
  index: number
}

export default class AttachmentsController {

  async handle({ request, response }: HttpContext) {
    const { key } = request.params()
    const format = request.qs()?.variant

    let multiple = false
    const data = encryption.decrypt(key) as Data

    await attachmentManager.lock.createLock(`attachment.${data.model}-${data.attribute}`).run(async () => {

      const queryWithTableSelection = await db
        .from(data.model)
        .select(data.attribute)
        .where('id', data.id).first()

      /*
      * 1. Get the Attachment(s)
      */
      const result = JSON.parse(queryWithTableSelection[data.attribute])
      const attachments: Attachment[] = []
      let currentAttachment: Attachment | null = null

      if (Array.isArray(result)) {
        multiple = true
        for (const item of result) {
          item.folder = path.dirname(item.path)
          const attachment = attachmentManager.createFromDbResponse(item)
          if (attachment) {
            attachment.setOptions(data.options)
            attachments.push(attachment)
          }
        }

        currentAttachment = attachments[data.index || 0]
      } else {
        result.folder = path.dirname(result.path)
        currentAttachment = attachmentManager.createFromDbResponse(result)
        if (currentAttachment) {
          currentAttachment.setOptions(data.options)
        }
      }

      if (!currentAttachment) {
        return response.notFound()
      }

      /*
      * 2. Get the variant
      */
      let variant = currentAttachment.getVariant(format)

      /*
      * 3. Get the stream
      * if variant and path, get the stream and return it
      * if not, generate the variant
      * if not, return the default file
      */
      if (!variant && format) {
        const converter = (await attachmentManager.getConverter(format)) as Converter

        variant = await (new VariantGeneratorService()).generateVariant({
          key: format,
          attachment: currentAttachment,
          converter
        })

        if (variant) {
          const variantPersister = new VariantPersisterService({
            id: data.id,
            modelTable: data.model,
            attributeName: data.attribute,
            multiple
          })

          const attachmentsOrCurrent = attachments.length ? attachments : [currentAttachment]
          await variantPersister.persist({ attachments: attachmentsOrCurrent, variants: [variant] })
        }
      }

      /*
      * 5. Get the stream
      */
      let stream
      let mimeType

      if (variant) {
        stream = await variant.getStream()
        mimeType = variant.mimeType
      } else if (currentAttachment) {
        stream = await currentAttachment.getStream()
        mimeType = currentAttachment.mimeType
      }

      /*
      * 6. Return the stream
      */
      if (stream && mimeType) {
        const readable = Readable.from(stream)

        response.header('Content-Type', mimeType)
        response.stream(readable)
      } else {
        return response.notFound()
      }
    })

  }
}
