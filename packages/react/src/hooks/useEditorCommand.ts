import { useCallback } from 'react'
import type { EditorCommand } from '@vetra/core'
import { useEditor } from '../context/EditorContext'

export function useEditorCommand() {
  const editor = useEditor()

  return useCallback((command: EditorCommand) => editor.dispatch(command), [editor])
}
