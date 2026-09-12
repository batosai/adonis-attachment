import app from "@adonisjs/core/services/app";
import { Attachment } from "./attachment.js";
import {
  AttachmentManager as SourceManager,
  type AttachmentSourceOptions,
  type MultipartAttachmentFile,
} from "../../sources/attachment_manager.js";
import type { AttachmentService } from "../../core/attachment_service.js";
import type { Readable } from "node:stream";

export { Attachment };
export { AttachmentMetadataConflictError } from "./errors.js";
export type { LegacyAttachmentConfig } from "./config.js";
export {
  attachment,
  attachments,
  type AttachmentOptions,
} from "./decorator.js";

/** Sources produce assignable legacy drafts; persistence still happens on model.save(). */
export class AttachmentManager {
  constructor(
    private readonly service: AttachmentService,
    private readonly sources = new SourceManager(service),
  ) {}
  async createFromBuffer(
    body: Uint8Array,
    nameOrOptions: string | AttachmentSourceOptions = {},
  ) {
    return new Attachment(
      await this.sources.createFromBuffer(
        body,
        typeof nameOrOptions === "string"
          ? { originalName: nameOrOptions }
          : nameOrOptions,
      ),
      this.service,
    );
  }
  async createFromFile(
    file: MultipartAttachmentFile,
    options?: AttachmentSourceOptions,
  ) {
    return new Attachment(
      await this.sources.createFromFile(file, options),
      this.service,
    );
  }
  async createFromPath(path: string, options?: AttachmentSourceOptions) {
    return new Attachment(
      await this.sources.createFromPath(path, options),
      this.service,
    );
  }
  async createFromFiles(
    files: readonly MultipartAttachmentFile[],
    options?: AttachmentSourceOptions,
  ) {
    return Promise.all(files.map((file) => this.createFromFile(file, options)));
  }
  async createFromBase64(input: string, options?: AttachmentSourceOptions) {
    return new Attachment(
      await this.sources.createFromBase64(input, options),
      this.service,
    );
  }
  async createFromUrl(input: string | URL, options?: AttachmentSourceOptions) {
    return new Attachment(
      await this.sources.createFromUrl(input, options),
      this.service,
    );
  }
  async createFromStream(input: Readable, options?: AttachmentSourceOptions) {
    return new Attachment(
      await this.sources.createFromStream(input, options),
      this.service,
    );
  }
}

async function manager(): Promise<AttachmentManager> {
  return new AttachmentManager(
    await app.container.make("jrmc.attachment"),
    await app.container.make("jrmc.attachment.manager"),
  );
}
export const attachmentManager = {
  async createFromFiles(
    ...args: Parameters<AttachmentManager["createFromFiles"]>
  ) {
    return (await manager()).createFromFiles(...args);
  },
  async createFromBuffer(
    ...args: Parameters<AttachmentManager["createFromBuffer"]>
  ) {
    return (await manager()).createFromBuffer(...args);
  },
  async createFromFile(
    ...args: Parameters<AttachmentManager["createFromFile"]>
  ) {
    return (await manager()).createFromFile(...args);
  },
  async createFromPath(
    ...args: Parameters<AttachmentManager["createFromPath"]>
  ) {
    return (await manager()).createFromPath(...args);
  },
  async createFromBase64(
    ...args: Parameters<AttachmentManager["createFromBase64"]>
  ) {
    return (await manager()).createFromBase64(...args);
  },
  async createFromUrl(...args: Parameters<AttachmentManager["createFromUrl"]>) {
    return (await manager()).createFromUrl(...args);
  },
  async createFromStream(
    ...args: Parameters<AttachmentManager["createFromStream"]>
  ) {
    return (await manager()).createFromStream(...args);
  },
};
