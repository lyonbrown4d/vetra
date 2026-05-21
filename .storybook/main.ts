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
    const existingAlias = (
      Array.isArray(config.resolve?.alias) ? {} : (config.resolve?.alias ?? {})
    ) as Record<string, string>

    return {
      ...config,
      optimizeDeps: {
        ...config.optimizeDeps,
        include: [...new Set([...(config.optimizeDeps?.include ?? []), ...lexicalOptimizeDeps])],
      },
      resolve: {
        ...config.resolve,
        dedupe: [...new Set([...(config.resolve?.dedupe ?? []), ...reactDedupe])],
        alias: {
          ...existingAlias,
          '@vetra/blocks-basic/react': fileURLToPath(
            new URL('../packages/blocks-basic/src/react.tsx', import.meta.url),
          ),
          '@vetra/blocks-basic': fileURLToPath(
            new URL('../packages/blocks-basic/src/index.ts', import.meta.url),
          ),
          '@vetra/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
          '@vetra/lexical': fileURLToPath(
            new URL('../packages/lexical/src/index.ts', import.meta.url),
          ),
          '@vetra/persistence-json': fileURLToPath(
            new URL('../packages/persistence-json/src/index.ts', import.meta.url),
          ),
          '@vetra/react': fileURLToPath(new URL('../packages/react/src/index.ts', import.meta.url)),
        },
      },
    }
  },
}

export default config
