/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export const defaultOptionsDecorator = {
  disk: 'local',
  folder: 'uploads',
  variants: [],
}

export const defaultStateAttributeMixin = {
  attached: [],
  detached: [],
  attributesModified: [],
}
