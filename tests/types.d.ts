/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

/**
 * Type declarations for Japa test context
 */
import type { Assert } from '@japa/assert'

declare module '@japa/runner' {
  interface TestContext {
    assert: Assert
  }
}
