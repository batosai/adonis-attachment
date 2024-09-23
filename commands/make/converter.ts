/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { stubsRoot } from '../../stubs/main.js'
import { args, BaseCommand } from '@adonisjs/core/ace'

/**
 * The make controller command to create an HTTP controller
 */
export default class MakeConverter extends BaseCommand {
  static commandName = 'make:converter'
  static description = 'Create a new media converter class'

  @args.string({ description: 'The name of the converter' })
  declare name: string

  protected stubPath: string = 'make/converter/main.stub'

  async run() {
    const codemods = await this.createCodemods()
    await codemods.makeUsingStub(stubsRoot, this.stubPath, {
      name: this.name,
    })
  }
}
