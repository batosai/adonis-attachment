import { assert } from '@japa/assert'
import { configure, processCLIArgs, run } from '@japa/runner'

processCLIArgs(process.argv.slice(2))

configure({
  files: ['build/tests/**/*.spec.js'],
  plugins: [assert()],
})

run()
