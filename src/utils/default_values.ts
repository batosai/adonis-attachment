/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export const defaultOptionsDecorator = {
  disk: undefined,
  folder: 'uploads',
  variants: [],
}

export const defaultStateAttributeMixin = {
  attached: [],
  detached: [],
  attributesModified: [],
}
