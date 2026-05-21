import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const rootPath = fileURLToPath(root)
const storybookBin = fileURLToPath(new URL('node_modules/storybook/bin/index.cjs', root))
const homePath = fileURLToPath(new URL('.codex-run/home/', root))
const testStorybookBin = fileURLToPath(
  new URL(
    process.platform === 'win32'
      ? 'node_modules/.bin/test-storybook.CMD'
      : 'node_modules/.bin/test-storybook',
    root,
  ),
)
const port = 6006
const url = `http://127.0.0.1:${String(port)}`

mkdirSync(homePath, { recursive: true })

const server = spawn(
  process.execPath,
  [storybookBin, 'dev', '-p', String(port), '--ci', '--host', '127.0.0.1'],
  {
    cwd: rootPath,
    env: {
      ...process.env,
      HOME: homePath,
      USERPROFILE: homePath,
      CI: 'true',
      STORYBOOK_DISABLE_TELEMETRY: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
server.unref()

server.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
})
server.stderr.on('data', (chunk) => {
  process.stderr.write(chunk)
})

try {
  await waitForServer(url)
  process.exitCode = await runTestStorybook()
} finally {
  await stopProcess(server.pid)
}

async function waitForServer(targetUrl) {
  const startedAt = Date.now()
  const timeoutMs = 90_000

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(targetUrl)
      if (response.ok) {
        return
      }
    } catch {
      // Storybook is still starting.
    }

    await delay(500)
  }

  throw new Error(`Timed out waiting for ${targetUrl}`)
}

function runTestStorybook() {
  return new Promise((resolve, reject) => {
    const child = spawn(testStorybookBin, ['--url', url], {
      cwd: rootPath,
      env: {
        ...process.env,
        HOME: homePath,
        USERPROFILE: homePath,
        CI: 'true',
        STORYBOOK_DISABLE_TELEMETRY: '1',
      },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      resolve(code ?? 1)
    })
  })
}

function stopProcess(pid) {
  server.stdout.destroy()
  server.stderr.destroy()

  if (pid === undefined) {
    return Promise.resolve()
  }

  if (process.platform !== 'win32') {
    server.kill('SIGTERM')
    return delay(250)
  }

  server.kill()
  const taskkill = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
    detached: true,
    stdio: 'ignore',
  })
  taskkill.unref()

  return delay(250)
}
