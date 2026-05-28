import type { DriveService } from '@adonisjs/drive/types'

export type Drive = {
  driveManager: DriveService
  diskDefault: string
}
