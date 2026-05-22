import { createContext, useContext, type ReactNode } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import type { BlockId } from '@vetra/core'

export interface BlockDragHandleState {
  readonly attributes: Partial<DraggableAttributes>
  readonly blockId: BlockId | undefined
  readonly disabled: boolean
  readonly dragging: boolean
  readonly listeners: DraggableSyntheticListeners
  readonly setActivatorNodeRef: (element: HTMLElement | null) => void
}

export interface BlockDragHandleProviderProps {
  readonly children: ReactNode
  readonly value: BlockDragHandleState
}

const disabledDragHandle: BlockDragHandleState = {
  attributes: {},
  blockId: undefined,
  disabled: true,
  dragging: false,
  listeners: undefined,
  setActivatorNodeRef: () => undefined,
}

const BlockDragHandleContext = createContext<BlockDragHandleState>(disabledDragHandle)

export function BlockDragHandleProvider(props: BlockDragHandleProviderProps) {
  return (
    <BlockDragHandleContext.Provider value={props.value}>
      {props.children}
    </BlockDragHandleContext.Provider>
  )
}

export function useBlockDragHandle(): BlockDragHandleState {
  return useContext(BlockDragHandleContext)
}
