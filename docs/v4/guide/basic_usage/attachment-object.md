# Attachment Object

The Attachment object is the main class that handles attached files in your application.

## Properties

### Base Properties
- `drive`: Drive service used for file management
- `name`: File name
- `originalName`: Original file name
- `folder`: Storage folder
- `path`: Complete file path
- `size`: File size in bytes
- `extname`: File extension
- `mimeType`: File MIME type
- `meta`: File metadata (EXIF)
- `originalPath`: Original file path
- `url`: File URL
- `variants`: Array of file variants

## Methods

### URL Management
- `getUrl(variantName?: string): Promise<string>`: Gets the file URL or a variant URL
- `getSignedUrl(variantNameOrOptions?: string | SignedURLOptions, signedUrlOptions?: SignedURLOptions): Promise<string>`: Gets a signed URL

### File Management
- `getDisk(): Disk`: Gets the storage disk
- `getBytes(): Promise<Uint8Array>`: Gets file content as bytes
- `getBuffer(): Promise<Buffer>`: Gets file content as buffer
- `getStream(): Promise<NodeJS.ReadableStream>`: Gets file content as stream

## Usage Examples

### URL Management
```typescript
// Getting the URL
const url = await attachment.getUrl();

// Getting a variant URL
const variantUrl = await attachment.getUrl('thumbnail');

// Getting a signed URL
const signedUrl = await attachment.getSignedUrl({
  expiresIn: '30m'
});

// Getting a signed URL for a variant
const signedVariantUrl = await attachment.getSignedUrl('thumbnail', {
  expiresIn: '30m'
});
```

### File Management
```typescript
// Getting the storage disk
const disk = attachment.getDisk();

// Getting file content as bytes
const bytes = await attachment.getBytes();

// Getting file content as buffer
const buffer = await attachment.getBuffer();

// Getting file content as stream
const stream = await attachment.getStream();
stream.pipe(fs.createWriteStream('output.jpg'));
```