import { dispatchCommand } from '@vetra/core/command/dispatch'
import type { EditorCommand } from '@vetra/core/command/types'
import type { CommandError } from '@vetra/core/command/errors'
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createEmptyHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryError,
  type HistoryState,
} from '@vetra/core/history/types'
import type { Result } from '@vetra/core/result'
import { ok } from '@vetra/core/result'
import type { EditorState } from '@vetra/core/state/types'
import type { Transaction } from '@vetra/core/transaction/types'

export type EditorStoreListener = () => void

export interface EditorRuntime {
  readonly dispatch: (command: EditorCommand) => Result<Transaction, CommandError>
  readonly undo: () => Result<Transaction, HistoryError>
  readonly redo: () => Result<Transaction, HistoryError>
  readonly canUndo: () => boolean
  readonly canRedo: () => boolean
  readonly getState: () => EditorState
  readonly subscribe: (listener: EditorStoreListener) => () => void
}

export function createEditor(initialState: EditorState): EditorRuntime {
  let currentState = initialState
  let history: HistoryState = createEmptyHistoryState()
  const listeners = new Set<EditorStoreListener>()

  function notifySubscribers() {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    dispatch(command) {
      const transactionResult = dispatchCommand(currentState, command)
      if (!transactionResult.ok) {
        return transactionResult
      }

      const transaction = transactionResult.value
      currentState = transaction.after

      if (shouldRecordHistory(transaction)) {
        history = pushHistory(history, transaction)
      }

      notifySubscribers()

      return ok(transaction)
    },
    undo() {
      const undoResult = undoHistory(history)
      if (!undoResult.ok) {
        return undoResult
      }

      history = undoResult.value.history
      currentState = undoResult.value.state
      notifySubscribers()

      return ok(undoResult.value.transaction)
    },
    redo() {
      const redoResult = redoHistory(history)
      if (!redoResult.ok) {
        return redoResult
      }

      history = redoResult.value.history
      currentState = redoResult.value.state
      notifySubscribers()

      return ok(redoResult.value.transaction)
    },
    canUndo() {
      return historyCanUndo(history)
    },
    canRedo() {
      return historyCanRedo(history)
    },
    getState() {
      return currentState
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function shouldRecordHistory(transaction: Transaction): boolean {
  return (
    transaction.changedBlockIds.length > 0 ||
    transaction.before.document.version !== transaction.after.document.version
  )
}
