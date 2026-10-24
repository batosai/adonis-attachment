import type { Route } from '@adonisjs/core/http'

export interface AttachmentRouteOptions {
  /** Allowed attachment disks. Defaults to the configured defaultDisk. */
  disks?: readonly string[]
}

declare module '@adonisjs/core/http' {
  interface Router {
    attachments(pattern?: string, options?: AttachmentRouteOptions): Route
  }
}
