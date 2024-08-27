/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export const defaultOptionsDecorator = {
  disk: undefined,
  folder: 'uploads',
  preComputeUrl: false,
  variants: [],
  meta: true,
  rename: true
}

export const defaultStateAttributeMixin = {
  attached: [],
  detached: [],
  attributesModified: [],
}
