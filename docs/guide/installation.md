# Installation

The Adonis Attachment package is available on [npm](https://www.npmjs.com/package/@jrmc/adonis-attachment). 
You can install it using the following ace command to automagically configure it:
```sh
node ace add @jrmc/adonis-attachment
```

Alternatively, you can install it manually using your favorite package manager and running the configure command:
::: code-group

```sh [npm]
npm install @jrmc/adonis-attachment
node ace configure @jrmc/adonis-attachment
```
```sh [pnpm]
pnpm install @jrmc/adonis-attachment
node ace configure @jrmc/adonis-attachment
```
```sh [yarn]
yarn add @jrmc/adonis-attachment
node ace configure @jrmc/adonis-attachment
```
:::


## Additional install

Variants images are generates by [sharp module](https://sharp.pixelplumbing.com) and require installation:

::: code-group
```sh [npm]
npm install sharp
```
```sh [pnpm]
pnpm install sharp
```
```sh [yarn]
yarn add sharp
```
:::


Variants images for thumbnail video are generates by [fluent-ffmpeg](https://www.npmjs.com/package/fluent-ffmpeg). Make sure you have [ffmpeg](https://ffmpeg.org) installed on your system (including all necessary encoding libraries like libmp3lame or libx264).

Installation required:

::: code-group
```sh [npm]
npm install fluent-ffmpeg
```
```sh [pnpm]
pnpm install fluent-ffmpeg
```
```sh [yarn]
yarn add fluent-ffmpeg
```
:::
