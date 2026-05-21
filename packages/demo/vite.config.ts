import react from '@vitejs/plugin-react'
import reactScan from '@react-scan/vite-plugin-react-scan'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PluginOption } from 'vite'

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
const createReactScanPlugin = reactScan as unknown as (
  options: ReactScanPluginOptions,
) => PluginOption
const alias = [
  {
    find: /^@vetra\/blocks-basic\/(.+)$/,
    replacement: fileURLToPath(new URL('../blocks-basic/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/blocks-basic',
    replacement: fileURLToPath(new URL('../blocks-basic/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/core\/(.+)$/,
    replacement: fileURLToPath(new URL('../core/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/core',
    replacement: fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/export-markdown\/(.+)$/,
    replacement: fileURLToPath(new URL('../export-markdown/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/export-markdown',
    replacement: fileURLToPath(new URL('../export-markdown/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/export-plain-text\/(.+)$/,
    replacement: fileURLToPath(new URL('../export-plain-text/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/export-plain-text',
    replacement: fileURLToPath(new URL('../export-plain-text/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/import-markdown\/(.+)$/,
    replacement: fileURLToPath(new URL('../import-markdown/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/import-markdown',
    replacement: fileURLToPath(new URL('../import-markdown/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/import-plain-text\/(.+)$/,
    replacement: fileURLToPath(new URL('../import-plain-text/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/import-plain-text',
    replacement: fileURLToPath(new URL('../import-plain-text/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/lexical\/(.+)$/,
    replacement: fileURLToPath(new URL('../lexical/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/lexical',
    replacement: fileURLToPath(new URL('../lexical/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/persistence-json\/(.+)$/,
    replacement: fileURLToPath(new URL('../persistence-json/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/persistence-json',
    replacement: fileURLToPath(new URL('../persistence-json/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/playground\/(.+)$/,
    replacement: fileURLToPath(new URL('./src/$1', import.meta.url)),
  },
  {
    find: /^@vetra\/react\/(.+)$/,
    replacement: fileURLToPath(new URL('../react/src/$1', import.meta.url)),
  },
  {
    find: '@vetra/react',
    replacement: fileURLToPath(new URL('../react/src/index.ts', import.meta.url)),
  },
  {
    find: /^@vetra\/stories\/(.+)$/,
    replacement: fileURLToPath(new URL('../../stories/$1', import.meta.url)),
  },
  {
    find: /^@vetra\/tests\/(.+)$/,
    replacement: fileURLToPath(new URL('../../tests/$1', import.meta.url)),
  },
]

export default defineConfig(({ mode }) => {
  const reactScanStatus = getReactScanStatus(mode)

  return {
    define: {
      __VETRA_REACT_SCAN_ENABLED__: JSON.stringify(reactScanStatus.enabled),
      __VETRA_REACT_SCAN_REASON__: JSON.stringify(reactScanStatus.reason),
    },
    optimizeDeps: {
      include: lexicalOptimizeDeps,
    },
    plugins: [
      react(),
      createReactScanPlugin({
        autoDisplayNames: reactScanStatus.enabled,
        enable: reactScanStatus.enabled,
        scanOptions: {
          enabled: reactScanStatus.enabled,
          log: false,
          showToolbar: true,
        },
      }),
    ],
    resolve: {
      alias,
      dedupe: reactDedupe,
    },
  }
})

interface ReactScanStatus {
  readonly enabled: boolean
  readonly reason: string
}

interface ReactScanPluginOptions {
  readonly autoDisplayNames: boolean
  readonly enable: boolean
  readonly scanOptions: {
    readonly enabled: boolean
    readonly log: boolean
    readonly showToolbar: boolean
  }
}

function getReactScanStatus(mode: string): ReactScanStatus {
  if (mode !== 'development') {
    return {
      enabled: false,
      reason: 'Disabled outside the local development server.',
    }
  }

  if (process.env.CI === 'true') {
    return {
      enabled: false,
      reason: 'Disabled while CI is running.',
    }
  }

  if (process.env.VETRA_REACT_SCAN === 'false' || process.env.VETRA_REACT_SCAN === '0') {
    return {
      enabled: false,
      reason: 'Disabled by VETRA_REACT_SCAN=false.',
    }
  }

  if (
    process.env.VETRA_PLAYWRIGHT === 'true' ||
    process.env.npm_lifecycle_event === 'test:e2e' ||
    process.env.npm_lifecycle_event === 'test:perf'
  ) {
    return {
      enabled: false,
      reason: 'Disabled for Playwright E2E and performance runs.',
    }
  }

  return {
    enabled: true,
    reason: 'Enabled for local playground development. Set VETRA_REACT_SCAN=false to disable.',
  }
}
