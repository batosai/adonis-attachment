import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Attachment } from '../../../core/attachment.js'
import type { AttachmentMetadataPersister } from '../../../core/attachment_metadata_persister.js'
import type { AttachmentReferenceRepository } from '../../../core/attachment_repository.js'
import { parseAttachmentReference, type AttachmentReference } from '../../../core/attachment_reference.js'
import { resolveAttachmentPersistenceOptions, type AttachmentPersistenceOptions } from '../../../core/attachment_options.js'
import { AttachmentConfigurationError, AttachmentValidationError } from '../../../errors.js'
import { getAttachmentRelationDefinitions, jsonRelationColumn } from '../relations/attachment_relation.js'
import { LucidJsonAttachmentStore } from './lucid_json_attachment_store.js'

/** Keys are logical owner types, values are trusted lazy imports (including in a cold worker). */
export type JsonAttachmentModels = Record<string, () => Promise<{ default: LucidModel }>>

export class LucidJsonAttachmentRegistry implements AttachmentReferenceRepository, AttachmentMetadataPersister {
  readonly #models: ReadonlyMap<string, JsonAttachmentModels[string]>

  constructor(private readonly options: {
    models: JsonAttachmentModels
    defaultDisk: string
    defaults?: AttachmentPersistenceOptions
  }) {
    this.#models = new Map(Object.entries(options.models))
  }

  async storeFor(value: AttachmentReference): Promise<LucidJsonAttachmentStore> {
    const reference = parseAttachmentReference(value)
    if (reference.adapter !== 'json' || !reference.owner) throw new AttachmentValidationError('JSON references require an explicit owner')
    const load = this.#models.get(reference.owner.type)
    if (!load) throw new AttachmentConfigurationError(`JSON attachment model "${reference.owner.type}" is not registered in integrations.lucid.jsonModels`)
    const { default: Model } = await load()
    Model.boot()
    const definition = getAttachmentRelationDefinitions(Model).find((item) => item.field === reference.owner!.field)
    if (!definition || definition.options.persistence !== 'json' ||
        (definition.options.type ?? Model.table) !== reference.owner.type) {
      throw new AttachmentConfigurationError('JSON reference does not match an authorized model field')
    }
    const disk = resolveAttachmentPersistenceOptions(this.options.defaults, definition.options).disk ?? this.options.defaultDisk
    return new LucidJsonAttachmentStore({
      client: Model.$adapter.modelConstructorClient(Model), table: Model.table,
      primaryKey: Model.$getColumn(Model.primaryKey)!.columnName,
      column: jsonRelationColumn(Model, definition), owner: reference.owner,
      kind: definition.kind, defaultDisk: disk,
    })
  }

  async findByReference(reference: AttachmentReference): Promise<Attachment | null> {
    return (await this.storeFor(reference)).findByReference(reference)
  }

  async persistMetadata(attachment: Attachment, metadata: NonNullable<Attachment['metadata']>): Promise<void> {
    if (!attachment.reference) throw new AttachmentValidationError('JSON metadata requires an attachment reference')
    await (await this.storeFor(attachment.reference)).persistMetadata(attachment, metadata)
  }
}
