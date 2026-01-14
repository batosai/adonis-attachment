/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../src/types/attachment.js'
import type { AttachmentEventPayload } from '../src/types/event.js'

import { test } from '@japa/runner'
import sinon from 'sinon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import Factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import emitter from '@adonisjs/core/services/emitter'

import BlurhashAdapter from '../src/adapters/blurhash.js'
import { attachmentManager, attachment } from '../index.js'
import { makeAttachment } from './helpers/index.js'

class UserEvent extends BaseModel {
  static table = 'users'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @attachment({ variants: ['thumbnail', 'medium'] })
  declare avatar: Attachment | null

  @column.dateTime({ autoCreate: true, serialize: (value: DateTime) => value.toUnixInteger() })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}

const UserEventFactory = Factory.define(UserEvent, async ({ faker }) => {
  return {
    name: faker.person.lastName(),
    avatar: await makeAttachment(),
  }
}).build()

test.group('attachment events', () => {
  test('should emit attachment:variant_started event with correct payload', async ({
    assert,
    cleanup,
  }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')

    const eventsEmitted: AttachmentEventPayload[] = []
    const eventListener = (data: AttachmentEventPayload) => {
      eventsEmitted.push(data)
    }

    emitter.on('attachment:variant_started', eventListener)

    cleanup(() => {
      encodeStub.restore()
      emitter.off('attachment:variant_started', eventListener)
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await UserEventFactory.create()
    await notifier

    assert.isAtLeast(eventsEmitted.length, 1)

    const payload = eventsEmitted[0]
    assert.properties(payload, ['tableName', 'attributeName', 'primary', 'variants'])
    assert.equal(payload.tableName, 'users')
    assert.equal(payload.attributeName, 'avatar')
    assert.properties(payload.primary, ['key', 'value'])
    assert.equal(payload.primary.key, 'id')
    assert.exists(payload.primary.value)
    assert.isArray(payload.variants)
    assert.includeMembers(payload.variants!, ['thumbnail', 'medium'])
  })

  test('should emit attachment:variant_completed event after variant generation', async ({
    assert,
    cleanup,
  }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')

    const eventsEmitted: AttachmentEventPayload[] = []
    const eventListener = (data: AttachmentEventPayload) => {
      eventsEmitted.push(data)
    }

    emitter.on('attachment:variant_completed', eventListener)

    cleanup(() => {
      encodeStub.restore()
      emitter.off('attachment:variant_completed', eventListener)
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await UserEventFactory.create()
    await notifier

    assert.isAtLeast(eventsEmitted.length, 1)

    const payload = eventsEmitted[0]
    assert.properties(payload, ['tableName', 'attributeName', 'primary', 'variants'])
    assert.equal(payload.tableName, 'users')
    assert.equal(payload.attributeName, 'avatar')
    assert.properties(payload.primary, ['key', 'value'])
    assert.equal(payload.primary.key, 'id')
    assert.exists(payload.primary.value)
    assert.isArray(payload.variants)
    assert.includeMembers(payload.variants!, ['thumbnail', 'medium'])
  })

  test('should emit events in correct order: started -> completed', async ({
    assert,
    cleanup,
  }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')

    const eventOrder: string[] = []

    const startedListener = () => {
      eventOrder.push('started')
    }

    const completedListener = () => {
      eventOrder.push('completed')
    }

    emitter.on('attachment:variant_started', startedListener)
    emitter.on('attachment:variant_completed', completedListener)

    cleanup(() => {
      encodeStub.restore()
      emitter.off('attachment:variant_started', startedListener)
      emitter.off('attachment:variant_completed', completedListener)
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await UserEventFactory.create()
    await notifier

    assert.isAtLeast(eventOrder.length, 2)
    assert.equal(eventOrder[0], 'started')
    assert.equal(eventOrder[1], 'completed')
  })

  test('should be able to listen attachment:variant_failed event', async ({ assert, cleanup }) => {
    let capturedPayload: AttachmentEventPayload | null = null

    const failedListener = (data: AttachmentEventPayload) => {
      capturedPayload = data
    }

    emitter.on('attachment:variant_failed', failedListener)

    cleanup(() => {
      emitter.off('attachment:variant_failed', failedListener)
    })

    // Manually emit the event to verify listener works correctly
    const mockPayload: AttachmentEventPayload = {
      tableName: 'users',
      attributeName: 'avatar',
      primary: {
        key: 'id',
        value: '123',
      },
      variants: ['thumbnail', 'medium'],
    }

    emitter.emit('attachment:variant_failed', mockPayload)

    // Small delay to ensure event is processed
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.isNotNull(capturedPayload)
    assert.properties(capturedPayload!, ['tableName', 'attributeName', 'primary', 'variants'])
    assert.equal(capturedPayload!.tableName, 'users')
    assert.equal(capturedPayload!.attributeName, 'avatar')
    assert.properties(capturedPayload!.primary, ['key', 'value'])
    assert.equal(capturedPayload!.primary.key, 'id')
    assert.equal(capturedPayload!.primary.value, '123')
    assert.isArray(capturedPayload!.variants)
    assert.includeMembers(capturedPayload!.variants!, ['thumbnail', 'medium'])
  })
})
