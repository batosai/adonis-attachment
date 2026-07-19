import type { ApplicationService } from '@adonisjs/core/types'

import type { AttachmentManager, attachmentManager } from '../index.js'

type Assert<T extends true> = T
type IsEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false

declare const app: ApplicationService

const resolvedManager = app.container.make('jrmc.attachment.manager')

type _containerBindingIsTyped = Assert<IsEqual<typeof resolvedManager, Promise<AttachmentManager>>>
type _rootExportIsTyped = Assert<IsEqual<typeof attachmentManager, AttachmentManager>>

export {}
