import { defineConfig, devices } from '@playwright/test'

const webServer =
  process.env.VETRA_SKIP_WEBSERVER === 'true'
    ? undefined
    : {
        command:
          'node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
        cwd: './packages/demo',
        env: {
          ...process.env,
          VETRA_PLAYWRIGHT: 'true',
          VETRA_REACT_SCAN: 'false',
        },
        gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 500 },
        port: 5173,
        reuseExistingServer: true,
        timeout: 120_000,
      }

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: process.env.CI === 'true' ? [['html', { open: 'never' }], ['list']] : [['list']],
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  ...(webServer === undefined ? {} : { webServer }),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
