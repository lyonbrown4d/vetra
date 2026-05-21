import { createContext, useContext, useMemo, type Context, type ReactNode } from 'react'
import type { EditorRuntime } from '@vetra/core'
import { createEditorDebugStore, EditorDebugContext } from '@vetra/react/context/EditorDebugContext'
import { EditorContext } from '@vetra/react/context/EditorContext'
import type { AnyReactBlockPlugin } from '@vetra/react/renderer/types'

export interface EditorProviderProps {
  readonly editor: EditorRuntime
  readonly blocks: readonly AnyReactBlockPlugin[]
  readonly children: ReactNode
}

const BlockRegistryContext = createContext<readonly AnyReactBlockPlugin[] | null>(null)

export function EditorProvider(props: EditorProviderProps) {
  const debugStore = useMemo(() => createEditorDebugStore(), [])

  return (
    <EditorContext.Provider value={props.editor}>
      <EditorDebugContext.Provider value={debugStore}>
        <BlockRegistryContext.Provider value={props.blocks}>
          {props.children}
        </BlockRegistryContext.Provider>
      </EditorDebugContext.Provider>
    </EditorContext.Provider>
  )
}

export function useBlockRegistry(): readonly AnyReactBlockPlugin[] {
  return useContextValue(
    BlockRegistryContext,
    'useBlockRegistry must be used inside <EditorProvider />.',
  )
}

function useContextValue<TValue>(context: Context<TValue | null>, message: string): TValue {
  const value = useContext(context)
  if (value === undefined || value === null) {
    throw new Error(message)
  }

  return value
}
