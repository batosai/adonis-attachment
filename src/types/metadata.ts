export interface FfmpegMetadata {
  types: string[]
  width: number
  height: number
  videoCodec: string
  audioCodec: string
  duration: number
  size: number
}

export interface PopplerMetadata {
  size: number;
  version: string;
  width: number;
  height: number;
  pages: number;
  creationDate: string;
}