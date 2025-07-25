import { assert } from '@japa/assert'
import { expectTypeOf } from '@japa/expect-type'
import { processCLIArgs, configure, run } from '@japa/runner'
import { createApp, initializeDatabase, removeDatabase } from '../tests/helpers/app.js'
import { fileSystem } from '@japa/file-system'
import app from '@adonisjs/core/services/app'
import { ApplicationService } from '@adonisjs/core/types'
import { BASE_URL } from '../tests/helpers/index.js'

let testApp: ApplicationService
processCLIArgs(process.argv.slice(2))
configure({
  files: ['tests/**/*.spec.ts'],
  plugins: [
    assert(),
    fileSystem({ basePath: BASE_URL }),
    expectTypeOf()
  ],
  setup: [
    async () => {
      testApp = await createApp()
      await initializeDatabase(testApp)
    },
  ],
  teardown: [
    async () => {
      await app.terminate()
      await testApp.terminate()
      await removeDatabase()
    },
  ],
})

/*
|--------------------------------------------------------------------------
| Run tests
|--------------------------------------------------------------------------
|
| The following "run" method is required to execute all the tests.
|
*/
run()
