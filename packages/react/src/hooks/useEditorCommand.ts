import { useCallback } from 'react'
import type { EditorCommand } from '@vetra/core'
import { useEditor } from '@vetra/react/context/EditorContext'

export function useEditorCommand() {
  const editor = useEditor()

  return useCallback((command: EditorCommand) => editor.dispatch(command), [editor])
}
