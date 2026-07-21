/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { args, BaseCommand } from '@adonisjs/core/ace'

import { stubsRoot } from '../../stubs/main.js'

export default class MakeConverter extends BaseCommand {
  static commandName = 'make:converter'
  static description = 'Create a new attachment variant converter'
  static options = { startApp: true }

  @args.string({ description: 'The converter name' })
  declare name: string

  async run(): Promise<void> {
    const codemods = await this.createCodemods()

    await codemods.makeUsingStub(stubsRoot, 'converters/converter.stub', { name: this.name })
  }
}
