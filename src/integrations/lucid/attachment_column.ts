import app from '@adonisjs/core/services/app'
import type { LucidModel, LucidRow } from '@adonisjs/lucid/types/model'

import type { Attachment } from '../../core/attachment.js'
import { isAttachmentPending, markAttachmentPersisted } from '../../core/attachment_state.js'
import type { AttachmentService } from '../../core/attachment_service.js'

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

const columnNames = new WeakMap<object, Set<string>>()
const saveStates = new WeakMap<object, AttachmentSaveState>()
const deleteStates = new WeakMap<object, Attachment[]>()
const patchedModels = new WeakSet<object>()

/**
 * Persists one Attachment JSON value in a Lucid column and coordinates file cleanup.
 */
export function attachment(): PropertyDecorator {
  return (target, propertyKey) => {
    const Model = target.constructor as AttachmentColumnModel
    const name = String(propertyKey)

    Model.boot()
    const columns = columnNames.get(Model) ?? new Set<string>()
    columns.add(name)
    columnNames.set(Model, columns)
    Model.$addColumn(name, makeColumnOptions())

    if (!patchedModels.has(Model)) {
      patchedModels.add(Model)
      Model.before('save', prepareSave)
      Model.after('save', finalizeSave)
      Model.before('delete', prepareDelete)
      Model.after('delete', finalizeDelete)
      wrapSave(Model)
    }
  }
}

function makeColumnOptions() {
  return {
    prepare(value: Attachment | null | undefined) {
      return value ? JSON.stringify(value) : null
    },
    consume(value: Attachment | string | null | undefined) {
      if (!value || typeof value !== 'string') {
        return value ?? null
      }

      return JSON.parse(value) as Attachment
    },
    serialize(value: Attachment | null | undefined) {
      return value ?? null
    },
  }
}

async function prepareSave(row: AttachmentColumnRow): Promise<void> {
  const state: AttachmentSaveState = { attached: [], detached: [] }

  for (const name of getColumnNames(row)) {
    const previous = toAttachment(row.$original[name])
    const current = toAttachment(row.$attributes[name])

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
  return columnNames.get(row.constructor) ?? new Set<string>()
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
