import { createContext, useContext } from 'react'
import type { EditorRuntime } from '@vetra/core'

export const EditorContext = createContext<EditorRuntime | null>(null)

export function useEditor(): EditorRuntime {
  const editor = useContext(EditorContext)
  if (editor === null) {
    throw new Error('useEditor must be used inside <EditorProvider />.')
  }

  return editor
}
