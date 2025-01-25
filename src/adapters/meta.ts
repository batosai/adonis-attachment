import { Meta, Input } from '../types/input.js'

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

export async function meta(input: Input): Promise<Meta> {
  let fileType
  let size = 0

  if (Buffer.isBuffer(input)) {
    fileType = await fileTypeFromBuffer(input)
    size = input.length
  } else {
    fileType = {
      ext: getFileExtension(input),
      mime: mime.lookup(input) || ''
    }

    if (fileType.ext === '' || fileType.mime === '') {
      fileType = await fileTypeFromFile(input)
    }

    const stats = await fs.stat(input)
    size = stats.size
  }

  return {
    extname: fileType!.ext,
    mimeType: fileType!.mime,
    size: size,
  }
}

export async function metaByFileName(filename: string) {
  return {
    extname: getFileExtension(filename),
    mimeType: mime.lookup(filename) || ''
  }
}
