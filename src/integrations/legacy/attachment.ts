import {
  AttachmentDraft,
  type Attachment as FileAttachment,
} from "../../core/attachment.js";
import type { AttachmentService } from "../../core/attachment_service.js";
import type { AttachmentMetadata } from "../../media/media_metadata.js";
import type { AttachmentSignedUrlOptions } from "../../core/storage.js";
import { AttachmentValidationError } from "../../errors.js";

/** A loaded legacy value. Only meta is mutable; file changes use a new draft. */
export class Attachment {
  meta: AttachmentMetadata | undefined;
  url: string | undefined;
  readonly variants: readonly Attachment[];
  readonly #file: FileAttachment;
  readonly #service: AttachmentService;
  /** @internal */
  constructor(
    file: FileAttachment,
    service: AttachmentService,
    variants: readonly Attachment[] = [],
    readonly key?: string,
  ) {
    this.#file = file instanceof AttachmentDraft ? file : structuredClone(file);
    this.#service = service;
    this.meta = structuredClone(file.metadata);
    this.url = file.url;
    this.variants = Object.freeze([...variants]);
  }
  get id() {
    return this.#file.id;
  }
  get name() {
    return this.#file.name;
  }
  get originalName() {
    return this.#file.originalName;
  }
  get disk() {
    return this.#file.disk;
  }
  get path() {
    return this.#file.path;
  }
  get size() {
    return this.#file.size;
  }
  get extname() {
    return this.#file.extname;
  }
  get mimeType() {
    return this.#file.mimeType;
  }
  get blurhash() {
    return this.#file.blurhash;
  }
  getVariant(key: string): Attachment | null {
    return this.variants.find((variant) => variant.key === key) ?? null;
  }
  async getUrl(key?: string): Promise<string | undefined> {
    return key === undefined
      ? this.#service.getUrl(this.file())
      : this.getVariant(key)?.getUrl();
  }
  async getSignedUrl(
    keyOrOptions?: string | AttachmentSignedUrlOptions,
    options?: AttachmentSignedUrlOptions,
  ): Promise<string | undefined> {
    return typeof keyOrOptions === "string"
      ? this.getVariant(keyOrOptions)?.getSignedUrl(options)
      : this.#service.getSignedUrl(this.file(), keyOrOptions);
  }
  getBytes(): Promise<Uint8Array> {
    return this.#service.read(this.file());
  }
  async getBuffer(): Promise<Buffer> {
    return Buffer.from(await this.getBytes());
  }
  async preComputeUrl(): Promise<void> {
    this.url = await this.getUrl();
    await Promise.all(this.variants.map((variant) => variant.preComputeUrl()));
  }
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      name: this.name,
      ...(this.key === undefined ? { originalName: this.originalName } : {}),
      size: this.size,
      extname: this.extname,
      mimeType: this.mimeType,
      meta: structuredClone(this.meta),
      ...(this.blurhash ? { blurhash: this.blurhash } : {}),
      ...(this.url ? { url: this.url } : {}),
    };
    for (const variant of this.variants) {
      if (Object.hasOwn(result, variant.key!))
        throw new AttachmentValidationError(
          "A legacy variant key collides with a serialized attachment property",
        );
      Object.defineProperty(result, variant.key!, {
        value: variant.toJSON(),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  }
  /** @internal Immutable baseline, never the mutable meta object. */
  file(): FileAttachment {
    if (this.#file instanceof AttachmentDraft && !this.#file.isPersisted) {
      throw new AttachmentValidationError(
        "Save the legacy attachment before accessing its stored file",
      );
    }
    return this.#file instanceof AttachmentDraft
      ? this.#file.toAttachment()
      : structuredClone(this.#file);
  }
  /** @internal */
  draft(): AttachmentDraft | undefined {
    return this.#file instanceof AttachmentDraft ? this.#file : undefined;
  }
  /** @internal */
  get hasMetadataChanges(): boolean {
    return (
      JSON.stringify(this.#file.metadata) !== JSON.stringify(this.meta) ||
      this.variants.some((variant) => variant.hasMetadataChanges)
    );
  }
}
