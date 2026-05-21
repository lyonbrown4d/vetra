import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { BlockId } from '@vetra/core'
import { useEditorDebugStore } from '../context/EditorDebugContext'

export function useMountedBlockCount(): number {
  const debugStore = useEditorDebugStore()
  const getSnapshot = useCallback(() => debugStore.getSnapshot().mountedBlockCount, [debugStore])

  return useSyncExternalStore(debugStore.subscribe, getSnapshot, getSnapshot)
}

export function useMountedBlockIds(): readonly BlockId[] {
  const debugStore = useEditorDebugStore()
  const getSnapshot = useCallback(() => debugStore.getSnapshot().mountedBlockIds, [debugStore])

  return useSyncExternalStore(debugStore.subscribe, getSnapshot, getSnapshot)
}

export function useMountedBlockRegistration(blockId: BlockId): void {
  const debugStore = useEditorDebugStore()

  useEffect(() => debugStore.registerMountedBlock(blockId), [blockId, debugStore])
}
