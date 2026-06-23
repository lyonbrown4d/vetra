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

interface BlockRegistryState {
  readonly plugins: readonly AnyReactBlockPlugin[]
  readonly pluginsByType: ReadonlyMap<string, AnyReactBlockPlugin>
}

const BlockRegistryContext = createContext<BlockRegistryState | null>(null)

export function EditorProvider(props: EditorProviderProps) {
  const debugStore = useMemo(() => createEditorDebugStore(), [])
  const blockRegistry = useMemo(() => createBlockRegistryState(props.blocks), [props.blocks])

  return (
    <EditorContext.Provider value={props.editor}>
      <EditorDebugContext.Provider value={debugStore}>
        <BlockRegistryContext.Provider value={blockRegistry}>
          {props.children}
        </BlockRegistryContext.Provider>
      </EditorDebugContext.Provider>
    </EditorContext.Provider>
  )
}

export function useBlockRegistry(): readonly AnyReactBlockPlugin[] {
  return useBlockRegistryState().plugins
}

export function useBlockPlugin(blockType: string | undefined): AnyReactBlockPlugin | undefined {
  const registry = useBlockRegistryState()

  return blockType === undefined ? undefined : registry.pluginsByType.get(blockType)
}

function createBlockRegistryState(blocks: readonly AnyReactBlockPlugin[]): BlockRegistryState {
  const pluginsByType = new Map<string, AnyReactBlockPlugin>()

  for (const block of blocks) {
    if (!pluginsByType.has(block.type)) {
      pluginsByType.set(block.type, block)
    }
  }

  return {
    plugins: blocks,
    pluginsByType,
  }
}

function useBlockRegistryState(): BlockRegistryState {
  return useContextValue(
    BlockRegistryContext,
    'Block registry hooks must be used inside <EditorProvider />.',
  )
}

function useContextValue<TValue>(context: Context<TValue | null>, message: string): TValue {
  const value = useContext(context)
  if (value === undefined || value === null) {
    throw new Error(message)
  }

  return value
}
