import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const alias = [
  {
    find: /^@vetra\/blocks-basic\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/blocks-basic/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/blocks-basic',
    replacement: fileURLToPath(new URL('./packages/blocks-basic/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/core\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/core/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/core',
    replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/export-markdown\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/export-markdown/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/export-markdown',
    replacement: fileURLToPath(new URL('./packages/export-markdown/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/export-plain-text\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/export-plain-text/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/export-plain-text',
    replacement: fileURLToPath(
      new URL('./packages/export-plain-text/src/index.ts', import.meta.url),
    ),
  },
  {
    find: /^@vetra\/import-markdown\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/import-markdown/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/import-markdown',
    replacement: fileURLToPath(new URL('./packages/import-markdown/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/import-plain-text\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/import-plain-text/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/import-plain-text',
    replacement: fileURLToPath(
      new URL('./packages/import-plain-text/src/index.ts', import.meta.url),
    ),
  },
  {
    find: /^@vetra\/lexical\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/lexical/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/lexical',
    replacement: fileURLToPath(new URL('./packages/lexical/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/persistence-json\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/persistence-json/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/persistence-json',
    replacement: fileURLToPath(
      new URL('./packages/persistence-json/src/index.ts', import.meta.url),
    ),
  },
  {
    find: /^@vetra\/playground\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/demo/src/$1', import.meta.url)),
  },
  {
    find: /^@vetra\/react\/(.+)$/,
    replacement: fileURLToPath(new URL('./packages/react/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/react',
    replacement: fileURLToPath(new URL('./packages/react/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/stories\/(.+)$/,
    replacement: fileURLToPath(new URL('./stories/$1', import.meta.url)),
  },
  {
    find: /^@vetra\/tests\/(.+)$/,
    replacement: fileURLToPath(new URL('./tests/$1', import.meta.url)),
  },
]

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    environment: 'node',
    include: ['packages/**/tests/**/*.test.ts', 'packages/**/tests/**/*.test.tsx'],
  },
})
