import { useEffect, useMemo, useRef } from 'react'
import {
  createEditor,
  createEditorState,
  type DocumentState,
  type EditorRuntime,
} from '@vetra/core'
import { EditorProvider } from './EditorProvider'
import { VirtualBlockList } from './VirtualBlockList'
import type { AnyReactBlockPlugin } from './renderer/types'

export interface EditorRootProps {
  readonly initialValue: DocumentState
  readonly blocks: readonly AnyReactBlockPlugin[]
  readonly className?: string
  readonly onChange?: (nextDocument: DocumentState) => void
}

export function EditorRoot(props: EditorRootProps) {
  const { onChange } = props
  const editor = useMemo<EditorRuntime>(
    () => createEditor(createEditorState(props.initialValue)),
    [props.initialValue],
  )
  const previousVersionRef = useRef(props.initialValue.version)

  useEffect(() => {
    if (onChange === undefined) {
      return undefined
    }

    return editor.subscribe(() => {
      const nextDocument = editor.getState().document
      if (nextDocument.version === previousVersionRef.current) {
        return
      }

      previousVersionRef.current = nextDocument.version
      onChange(nextDocument)
    })
  }, [editor, onChange])

  return (
    <EditorProvider blocks={props.blocks} editor={editor}>
      <div className={props.className ?? 'vetra-editor-root'}>
        <VirtualBlockList />
      </div>
    </EditorProvider>
  )
}
