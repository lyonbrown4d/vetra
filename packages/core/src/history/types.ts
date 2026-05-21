import { err, ok, type Result } from '@vetra/core/result'
import type { EditorState } from '@vetra/core/state/types'
import type { Transaction } from '@vetra/core/transaction/types'

export interface HistoryState {
  readonly undoStack: readonly Transaction[]
  readonly redoStack: readonly Transaction[]
}

export type HistoryErrorCode = 'emptyUndoStack' | 'emptyRedoStack'

export interface HistoryError {
  readonly code: HistoryErrorCode
  readonly message: string
}

export interface HistoryStep {
  readonly history: HistoryState
  readonly state: EditorState
  readonly transaction: Transaction
}

export function createEmptyHistoryState(): HistoryState {
  return {
    undoStack: [],
    redoStack: [],
  }
}

export function canUndo(history: HistoryState): boolean {
  return history.undoStack.length > 0
}

export function canRedo(history: HistoryState): boolean {
  return history.redoStack.length > 0
}

export function pushHistory(history: HistoryState, transaction: Transaction): HistoryState {
  return {
    undoStack: [...history.undoStack, transaction],
    redoStack: [],
  }
}

export function undoHistory(history: HistoryState): Result<HistoryStep, HistoryError> {
  const transactionIndex = history.undoStack.length - 1
  const transaction = history.undoStack[transactionIndex]

  if (transaction === undefined) {
    return err({
      code: 'emptyUndoStack',
      message: 'Cannot undo because the undo stack is empty.',
    })
  }

  return ok({
    history: {
      undoStack: history.undoStack.slice(0, transactionIndex),
      redoStack: [...history.redoStack, transaction],
    },
    state: transaction.before,
    transaction,
  })
}

export function redoHistory(history: HistoryState): Result<HistoryStep, HistoryError> {
  const transactionIndex = history.redoStack.length - 1
  const transaction = history.redoStack[transactionIndex]

  if (transaction === undefined) {
    return err({
      code: 'emptyRedoStack',
      message: 'Cannot redo because the redo stack is empty.',
    })
  }

  return ok({
    history: {
      undoStack: [...history.undoStack, transaction],
      redoStack: history.redoStack.slice(0, transactionIndex),
    },
    state: transaction.after,
    transaction,
  })
}
