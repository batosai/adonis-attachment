/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export function cleanObject(obj: any) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  const cleanedObj: any = Array.isArray(obj) ? [] : {}

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const cleanedValue = cleanObject(obj[key])

      if (cleanedValue !== null && cleanedValue !== undefined && cleanedValue !== 0 && cleanedValue !== '') {
        cleanedObj[key] = cleanedValue
      }
    }
  }

  return cleanedObj
}
