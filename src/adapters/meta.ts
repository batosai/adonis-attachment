import { Meta } from '../types/input.js'

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type'
import mime from 'mime-types'

function getFileExtension(filename: string) {
  if (!filename){
    return ''
  }

  const ext = path.extname(filename).slice(1)
  return ext && /^[a-zA-Z0-9]+$/.test(ext) ? ext : ''
}

function metaByFileName(filename: string) {
  return {
    ext: getFileExtension(filename),
    mime: mime.lookup(filename) || ''
  }
}

export async function metaFormBuffer(input: Buffer): Promise<Meta> {
  const fileType = await fileTypeFromBuffer(input)

  return {
    extname: fileType?.ext || '',
    mimeType: fileType?.mime || '',
    size: input.length,
  }
}

export async function metaFormFile(input: string, filename: string): Promise<Meta> {
  let fileType
  let size = 0

  fileType = metaByFileName(filename)
  if (fileType.ext === '' || fileType.mime === '') {
    fileType = await fileTypeFromFile(input)
  }

  const stats = await fs.stat(input)
  size = stats.size

  return {
    extname: fileType?.ext || '',
    mimeType: fileType?.mime || '',
    size,
  }
}
