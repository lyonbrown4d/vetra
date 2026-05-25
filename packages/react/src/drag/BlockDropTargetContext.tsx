import { createContext, type ReactNode, useContext } from 'react'
import type { BlockId } from '@vetra/core'

export interface BlockDropTargetContextValue {
  readonly overBlockId: BlockId | undefined
  readonly overTail: boolean
}

const defaultBlockDropTargetContextValue: BlockDropTargetContextValue = {
  overBlockId: undefined,
  overTail: false,
}

const BlockDropTargetContext = createContext<BlockDropTargetContextValue>(
  defaultBlockDropTargetContextValue,
)

export interface BlockDropTargetProviderProps {
  readonly children: ReactNode
  readonly value: BlockDropTargetContextValue
}

export function BlockDropTargetProvider(props: BlockDropTargetProviderProps) {
  return (
    <BlockDropTargetContext.Provider value={props.value}>
      {props.children}
    </BlockDropTargetContext.Provider>
  )
}

export function useBlockDropTarget(): BlockDropTargetContextValue {
  return useContext(BlockDropTargetContext)
}
