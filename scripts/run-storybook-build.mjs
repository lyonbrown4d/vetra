import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const rootPath = fileURLToPath(root)
const storybookBin = fileURLToPath(new URL('node_modules/storybook/bin/index.cjs', root))
const homePath = fileURLToPath(new URL('.codex-run/home/', root))

mkdirSync(homePath, { recursive: true })

const child = spawn(process.execPath, [storybookBin, 'build'], {
  cwd: rootPath,
  env: {
    ...process.env,
    HOME: homePath,
    USERPROFILE: homePath,
    CI: 'true',
    STORYBOOK_DISABLE_TELEMETRY: '1',
  },
  stdio: 'inherit',
})

child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
