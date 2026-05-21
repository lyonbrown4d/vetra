import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { EditorState } from '@vetra/core'
import { useEditor } from '@vetra/react/context/EditorContext'

export type EditorStateSelector<TSnapshot> = (state: EditorState) => TSnapshot
export type EditorSnapshotEquality<TSnapshot> = (previous: TSnapshot, next: TSnapshot) => boolean

export function useEditorSelector<TSnapshot>(
  selector: EditorStateSelector<TSnapshot>,
  isEqual: EditorSnapshotEquality<TSnapshot> = objectIs,
): TSnapshot {
  const editor = useEditor()
  const selectorRef = useRef(selector)
  const isEqualRef = useRef(isEqual)
  const snapshotRef = useRef<{ readonly value: TSnapshot } | undefined>(undefined)

  selectorRef.current = selector
  isEqualRef.current = isEqual

  const getSnapshot = useCallback(() => {
    const nextValue = selectorRef.current(editor.getState())
    const previousSnapshot = snapshotRef.current

    if (previousSnapshot !== undefined && isEqualRef.current(previousSnapshot.value, nextValue)) {
      return previousSnapshot.value
    }

    snapshotRef.current = { value: nextValue }
    return nextValue
  }, [editor])

  return useSyncExternalStore(editor.subscribe, getSnapshot, getSnapshot)
}

function objectIs<TValue>(previous: TValue, next: TValue): boolean {
  return Object.is(previous, next)
}
