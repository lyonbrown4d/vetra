import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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

export default defineConfig({
  optimizeDeps: {
    include: lexicalOptimizeDeps,
  },
  plugins: [react()],
  resolve: {
    dedupe: reactDedupe,
  },
})
