import type { HttpContext } from '@adonisjs/core/http'
import type { Converter } from '../types/converter.js'

import path from 'node:path'
import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { attachmentManager } from '@jrmc/adonis-attachment'
import { ConverterManager } from '../converter_manager.js'
import { LucidOptions } from '../types/attachment.js'
import { Readable } from 'node:stream'

type Data = {
  model: string
  attribute: string
  id: string
  options: LucidOptions
}

export default class AttachmentsController {

  async handle({ request, response }: HttpContext) {
    const { key } = request.params()
    const format = request.qs()?.variant
    const index = request.qs()?.index

    let isAttachments = false
    const data = encryption.decrypt(key) as Data

    const queryWithTableSelection = await db
      .from(data.model)
      .select(data.attribute)
      .where('id', data.id).first()

    /*
    * 1. Get the entity
    */
    let result = JSON.parse(queryWithTableSelection[data.attribute])

    if (Array.isArray(result)) {
      isAttachments = true
      result = result[index || 0]
    }

    result.folder = path.dirname(result.path)

    /*
    * 2. Get the attachment
    */
    const attachment = attachmentManager.createFromDbResponse(result)
    attachment?.setOptions(data?.options)

    if (!attachment) {
      return response.notFound()
    }

    /*
    * 4. Get the variant
    */
    const variant = attachment?.getVariant(format)

    /*
    * 5. Get the stream
    * if variant and path, get the stream and return it
    * if not, generate the variant
    * if not, return the default file
    */
    if (variant && variant?.path) {
      const image = await variant.getStream()
      const readable = Readable.from(image)

      response.header('Content-Type', variant?.mimeType)
      response.stream(readable)
    } else {
      let attachmentOrAttachmentsString: string
      const converter = (await attachmentManager.getConverter(format)) as Converter

      const variant = await ConverterManager.generate({
        key: format,
        attachment,
        converter
      })

      if (isAttachments) {
        attachmentOrAttachmentsString = JSON.stringify([attachment.toObject()])
      } else {
        attachmentOrAttachmentsString = JSON.stringify(attachment.toObject())
      }

      const trx = await db.transaction()
      // trx.after('rollback', rollback)

      try {
        await trx.query().from(data.model).where('id', data.id).update({
          [data.attribute]: attachmentOrAttachmentsString
        })

        await trx.commit()
      } catch (error) {
        await trx.rollback()
      } finally {
        if (!variant) {
          return response.notFound()
        }
        const image = await variant.getStream()
        const readable = Readable.from(image)

        response.header('Content-Type', variant.mimeType)
        response.stream(readable)
      }
    }
  }
}