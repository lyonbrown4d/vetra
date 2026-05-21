import { createContext, useContext } from 'react'
import type { BlockId } from '@vetra/core'

export interface EditorDebugSnapshot {
  readonly mountedBlockCount: number
  readonly mountedBlockIds: readonly BlockId[]
}

export type EditorDebugListener = () => void

export interface EditorDebugStore {
  readonly getSnapshot: () => EditorDebugSnapshot
  readonly registerMountedBlock: (blockId: BlockId) => () => void
  readonly subscribe: (listener: EditorDebugListener) => () => void
}

export const EditorDebugContext = createContext<EditorDebugStore | null>(null)

const emptySnapshot: EditorDebugSnapshot = {
  mountedBlockCount: 0,
  mountedBlockIds: [],
}

export function createEditorDebugStore(): EditorDebugStore {
  const listeners = new Set<EditorDebugListener>()
  const mountedBlockCounts = new Map<BlockId, number>()
  let mountedBlockCount = 0
  let snapshot = emptySnapshot

  function emit() {
    snapshot = {
      mountedBlockCount,
      mountedBlockIds: [...mountedBlockCounts.keys()],
    }

    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getSnapshot() {
      return snapshot
    },
    registerMountedBlock(blockId) {
      mountedBlockCounts.set(blockId, (mountedBlockCounts.get(blockId) ?? 0) + 1)
      mountedBlockCount += 1
      emit()

      let registered = true

      return () => {
        if (!registered) {
          return
        }

        registered = false

        const nextBlockCount = (mountedBlockCounts.get(blockId) ?? 1) - 1
        if (nextBlockCount <= 0) {
          mountedBlockCounts.delete(blockId)
        } else {
          mountedBlockCounts.set(blockId, nextBlockCount)
        }

        mountedBlockCount -= 1
        emit()
      }
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function useEditorDebugStore(): EditorDebugStore {
  const debugStore = useContext(EditorDebugContext)
  if (debugStore === null) {
    throw new Error('useEditorDebugStore must be used inside <EditorProvider />.')
  }

  return debugStore
}
