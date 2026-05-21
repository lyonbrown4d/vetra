import type { DocBlock, EditorRuntime } from '@vetra/core'
import type { ComponentType } from 'react'

export interface BlockRendererProps<TBlock extends DocBlock = DocBlock> {
  readonly block: TBlock
  readonly editor: EditorRuntime
  readonly selected: boolean
  readonly active: boolean
}

export interface ReactBlockPlugin<TBlock extends DocBlock = DocBlock> {
  readonly type: TBlock['type']
  readonly readonlyRenderer: ComponentType<BlockRendererProps<TBlock>>
  readonly activeRenderer?: ComponentType<BlockRendererProps<TBlock>>
}

export interface AnyReactBlockPlugin {
  readonly type: string
  readonly readonlyRenderer: ComponentType<BlockRendererProps>
  readonly activeRenderer?: ComponentType<BlockRendererProps>
}

export function defineReactBlock<TBlock extends DocBlock>(
  plugin: ReactBlockPlugin<TBlock>,
): AnyReactBlockPlugin {
  return plugin as unknown as AnyReactBlockPlugin
}
