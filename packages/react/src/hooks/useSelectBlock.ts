import { useCallback } from 'react'
import type { BlockId, CommandError, Result, Transaction } from '@vetra/core'
import { useEditor } from '../context/EditorContext'

export type SelectBlockHandler = () => Result<Transaction, CommandError>

export function useSelectBlock(blockId: BlockId): SelectBlockHandler {
  const editor = useEditor()

  return useCallback(
    () =>
      editor.dispatch({
        type: 'setSelection',
        selection: { type: 'block', blockId },
      }),
    [blockId, editor],
  )
}
