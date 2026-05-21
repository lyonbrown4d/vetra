import type { StorybookConfig } from '@storybook/react-vite'
import { fileURLToPath } from 'node:url'

const reactDedupe = ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
const lexicalOptimizeDeps = [
  'lexical',
  '@lexical/react/LexicalComposer',
  '@lexical/react/LexicalComposerContext',
  '@lexical/react/LexicalContentEditable',
  '@lexical/react/LexicalErrorBoundary',
  '@lexical/react/LexicalOnChangePlugin',
  '@lexical/react/LexicalPlainTextPlugin',
]
interface ViteAliasEntry {
  find: string | RegExp
  replacement: string
}

const alias: ViteAliasEntry[] = [
  {
    find: /^@vetra\/blocks-basic\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/blocks-basic/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/blocks-basic',
    replacement: fileURLToPath(new URL('../packages/blocks-basic/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/core\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/core/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/core',
    replacement: fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/export-markdown\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/export-markdown/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/export-markdown',
    replacement: fileURLToPath(
      new URL('../packages/export-markdown/src/index.ts', import.meta.url),
    ),
  },
  {
    find: /^@vetra\/export-plain-text\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/export-plain-text/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/export-plain-text',
    replacement: fileURLToPath(
      new URL('../packages/export-plain-text/src/index.ts', import.meta.url),
    ),
  },
  {
    find: /^@vetra\/import-markdown\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/import-markdown/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/import-markdown',
    replacement: fileURLToPath(
      new URL('../packages/import-markdown/src/index.ts', import.meta.url),
    ),
  },
  {
    find: /^@vetra\/import-plain-text\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/import-plain-text/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/import-plain-text',
    replacement: fileURLToPath(
      new URL('../packages/import-plain-text/src/index.ts', import.meta.url),
    ),
  },
  {
    find: /^@vetra\/lexical\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/lexical/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/lexical',
    replacement: fileURLToPath(new URL('../packages/lexical/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/persistence-json\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/persistence-json/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/persistence-json',
    replacement: fileURLToPath(
      new URL('../packages/persistence-json/src/index.ts', import.meta.url),
    ),
  },
  {
    find: /^@vetra\/playground\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/demo/src/$1', import.meta.url)),
  },
  {
    find: /^@vetra\/react\/(.+)$/,
    replacement: fileURLToPath(new URL('../packages/react/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/react',
    replacement: fileURLToPath(new URL('../packages/react/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/stories\/(.+)$/,
    replacement: fileURLToPath(new URL('../stories/$1', import.meta.url)),
  },
  {
    find: /^@vetra\/tests\/(.+)$/,
    replacement: fileURLToPath(new URL('../tests/$1', import.meta.url)),
  },
]

function isAliasEntry(value: unknown): value is ViteAliasEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    (typeof candidate.find === 'string' || candidate.find instanceof RegExp) &&
    typeof candidate.replacement === 'string'
  )
}

function isAliasRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every((replacement) => typeof replacement === 'string')
}

function normalizeAlias(aliasOptions: unknown): ViteAliasEntry[] {
  if (Array.isArray(aliasOptions)) {
    return aliasOptions.filter(isAliasEntry)
  }

  if (isAliasRecord(aliasOptions)) {
    return Object.entries(aliasOptions).map(([find, replacement]) => ({ find, replacement }))
  }

  return []
}

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  viteFinal(config) {
    const existingAliasEntries = normalizeAlias(config.resolve?.alias)

    return {
      ...config,
      optimizeDeps: {
        ...config.optimizeDeps,
        include: [...new Set([...(config.optimizeDeps?.include ?? []), ...lexicalOptimizeDeps])],
      },
      resolve: {
        ...config.resolve,
        dedupe: [...new Set([...(config.resolve?.dedupe ?? []), ...reactDedupe])],
        alias: [...existingAliasEntries, ...alias],
      },
    }
  },
}

export default config
