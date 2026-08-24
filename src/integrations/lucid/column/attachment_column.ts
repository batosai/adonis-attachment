/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import app from '@adonisjs/core/services/app'
import type { LucidModel, LucidRow } from '@adonisjs/lucid/types/model'

import { isAttachmentDraft, toPersistedAttachment, type Attachment } from '../../../core/attachment.js'
import { isAttachmentPending, markAttachmentPersisted } from '../../../core/attachment_state.js'
import type { AttachmentPersistenceOptions } from '../../../core/attachment_options.js'
import type { AttachmentService } from '../../../core/attachment_service.js'

type AttachmentColumnRow = LucidRow & {
  $attributes: Record<string, unknown>
  $original: Record<string, unknown>
  $trx?: {
    after(event: 'commit' | 'rollback', callback: () => void | Promise<void>): void
  }
}

type AttachmentColumnModel = LucidModel & {
  prototype: AttachmentColumnRow
}

type AttachmentSaveState = {
  attached: Attachment[]
  detached: Attachment[]
}

export type LucidAttachmentOptions<Model = any> = AttachmentPersistenceOptions<Model> & {
  serialize?: (value: Attachment | null | undefined) => unknown
  serializeAs?: string | null
}

const columnOptions = new WeakMap<object, Map<string, LucidAttachmentOptions<any>>>()
const saveStates = new WeakMap<object, AttachmentSaveState>()
const deleteStates = new WeakMap<object, Attachment[]>()
const patchedModels = new WeakSet<object>()

/**
 * Persists one Attachment JSON value in a Lucid column and coordinates file cleanup.
 */
export function attachment<Model = LucidRow>(options: LucidAttachmentOptions<Model> = {}): PropertyDecorator {
  return (target, propertyKey) => {
    const Model = target.constructor as AttachmentColumnModel
    const name = String(propertyKey)

    Model.boot()
    const columns = columnOptions.get(Model) ?? new Map<string, LucidAttachmentOptions<any>>()
    columns.set(name, options as LucidAttachmentOptions<any>)
    columnOptions.set(Model, columns)
    Model.$addColumn(name, makeColumnOptions(options))

    if (!patchedModels.has(Model)) {
      patchedModels.add(Model)
      Model.before('save', prepareSave)
      Model.after('save', finalizeSave)
      Model.before('delete', prepareDelete)
      Model.after('delete', finalizeDelete)
      Model.after('find', preComputeColumnUrl)
      Model.after('fetch', preComputeColumnUrls)
      wrapSave(Model)
    }
  }
}

function makeColumnOptions(options: LucidAttachmentOptions<any>) {
  return {
    prepare(value: Attachment | null | undefined) {
      return value ? JSON.stringify(toPersistedAttachment(value)) : null
    },
    consume(value: Attachment | string | null | undefined) {
      if (!value || typeof value !== 'string') {
        return value ?? null
      }

      return JSON.parse(value) as Attachment
    },
    serialize: options.serialize ?? ((value: Attachment | null | undefined) => value ?? null),
    ...(options.serializeAs !== undefined ? { serializeAs: options.serializeAs } : {}),
  }
}

async function preComputeColumnUrl(row: AttachmentColumnRow): Promise<void> {
  const service = (await app.container.make('jrmc.attachment')) as AttachmentService

  for (const name of getColumnNames(row)) {
    const attachment = toAttachment(row.$attributes[name])
    const options = columnOptions.get(row.constructor)?.get(name)

    if (attachment && service.getPreComputeUrlEnabled(options)) {
      row.$attributes[name] = await service.preComputeUrl(attachment)
    }
  }
}

async function preComputeColumnUrls(rows: AttachmentColumnRow[]): Promise<void> {
  await Promise.all(rows.map((row) => preComputeColumnUrl(row)))
}

async function prepareSave(row: AttachmentColumnRow): Promise<void> {
  const state: AttachmentSaveState = { attached: [], detached: [] }

  for (const name of getColumnNames(row)) {
    const previous = toAttachment(row.$original[name])
    const current = await persistDraft(row, name)

    if (previous?.id === current?.id) {
      continue
    }

    if (current && isAttachmentPending(current)) {
      state.attached.push(current)
    }
    if (previous) {
      state.detached.push(previous)
    }
  }

  saveStates.set(row, state)
}

async function finalizeSave(row: AttachmentColumnRow): Promise<void> {
  const state = saveStates.get(row)
  if (!state) {
    return
  }

  const commit = async () => {
    markPersisted(state.attached)
    await removeAll(state.detached)
  }
  const rollback = async () => {
    await removeAll(state.attached)
  }

  if (row.$trx) {
    row.$trx.after('commit', commit)
    row.$trx.after('rollback', rollback)
  } else {
    await commit()
  }

  saveStates.delete(row)
}

async function prepareDelete(row: AttachmentColumnRow): Promise<void> {
  deleteStates.set(
    row,
    Array.from(getColumnNames(row))
      .map((name) => toAttachment(row.$attributes[name]))
      .filter((value): value is Attachment => value !== null)
  )
}

async function finalizeDelete(row: AttachmentColumnRow): Promise<void> {
  const attachments = deleteStates.get(row) ?? []
  const commit = () => removeAll(attachments)

  if (row.$trx) {
    row.$trx.after('commit', commit)
  } else {
    await commit()
  }

  deleteStates.delete(row)
}

function wrapSave(Model: AttachmentColumnModel): void {
  const save = Model.prototype.save

  Model.prototype.save = async function saveWithAttachmentCleanup() {
    try {
      return await save.call(this)
    } catch (error) {
      const state = saveStates.get(this)
      saveStates.delete(this)
      await removeAll(state?.attached ?? [])
      throw error
    }
  }
}

function getColumnNames(row: AttachmentColumnRow): Set<string> {
  return new Set(columnOptions.get(row.constructor)?.keys())
}

async function persistDraft(row: AttachmentColumnRow, name: string): Promise<Attachment | null> {
  const value = row.$attributes[name]

  if (!isAttachmentDraft(value)) {
    return toAttachment(value)
  }

  const options = columnOptions.get(row.constructor)?.get(name)
  const attachment = await value.persist({
    ...(options ? { options } : {}),
    context: { model: row, field: name },
  })
  row.$attributes[name] = attachment

  return attachment
}

function toAttachment(value: unknown): Attachment | null {
  if (!value || typeof value !== 'object' || !('id' in value) || !('disk' in value) || !('path' in value)) {
    return null
  }

  return value as Attachment
}

function markPersisted(attachments: readonly Attachment[]): void {
  attachments.forEach((attachment) => markAttachmentPersisted(attachment))
}

async function removeAll(attachments: readonly Attachment[]): Promise<void> {
  if (attachments.length === 0) {
    return
  }

  const service = (await app.container.make('jrmc.attachment')) as AttachmentService
  await Promise.allSettled(attachments.map((attachment) => service.remove(attachment)))
}
