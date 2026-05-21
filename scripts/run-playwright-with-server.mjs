import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const rootPath = fileURLToPath(root)
const demoCwd = fileURLToPath(new URL('packages/demo/', root))
const viteBin = fileURLToPath(new URL('node_modules/vite/bin/vite.js', root))
const playwrightCli = fileURLToPath(new URL('node_modules/@playwright/test/cli.js', root))
const testArgs = process.argv.slice(2)
const port = 5173
const url = `http://127.0.0.1:${String(port)}`

const server = spawn(
  process.execPath,
  [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: demoCwd,
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

  const result = await runPlaywright(testArgs)
  process.exitCode = result
} finally {
  await stopProcess(server.pid)
}

async function waitForServer(targetUrl) {
  const startedAt = Date.now()
  const timeoutMs = 30_000

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(targetUrl)
      if (response.ok) {
        return
      }
    } catch {
      // Vite is still starting.
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for ${targetUrl}`)
}

function runPlaywright(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, 'test', ...args], {
      cwd: rootPath,
      env: {
        ...process.env,
        VETRA_SKIP_WEBSERVER: 'true',
      },
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
