import { spawn } from 'node:child_process'
import { mkdtemp, open, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; temporaryNpmCache?: boolean } = {}
): Promise<{ stdout: string; stderr: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'attachment-test-command-'))
  try {
    const stdoutPath = join(directory, 'stdout')
    const stderrPath = join(directory, 'stderr')
    // Regular files also capture output in sandboxes that restrict subprocess pipes.
    await using stdoutFile = await open(stdoutPath, 'wx')
    await using stderrFile = await open(stderrPath, 'wx')
    const status = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        ...(options.temporaryNpmCache
          ? { env: { ...process.env, npm_config_cache: join(directory, 'npm-cache') } }
          : {}),
        stdio: ['ignore', stdoutFile.fd, stderrFile.fd],
        timeout: 25_000,
        killSignal: 'SIGKILL',
      })
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, 'utf8'),
      readFile(stderrPath, 'utf8'),
    ])
    if (status.code !== 0) {
      throw new Error(`${command} exited with ${status.signal ?? status.code}\n${stderr || stdout}`)
    }
    return { stdout, stderr }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
