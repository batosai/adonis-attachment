import type { HttpContext } from '@adonisjs/core/http'

import type { AttachmentService } from '../core/attachment_service.js'
import type { AttachmentRepository } from '../core/attachment_repository.js'

export class AttachmentsController {
  constructor(
    private readonly attachments: Pick<AttachmentService, 'read'>,
    private readonly repository: AttachmentRepository
  ) {}

  async handle({ request, response }: HttpContext): Promise<unknown> {
    const attachment = await this.repository.findById(request.param('id'))

    if (!attachment) {
      return response.notFound()
    }

    response.header('content-type', attachment.mimeType)
    return response.send(await this.attachments.read(attachment))
  }
}
