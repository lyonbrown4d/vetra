import { dispatchCommand } from '../command/dispatch'
import type { EditorCommand } from '../command/types'
import type { CommandError } from '../command/errors'
import type { Result } from '../result'
import { ok } from '../result'
import type { EditorState } from '../state/types'
import type { Transaction } from '../transaction/types'

export type EditorStoreListener = () => void

export interface EditorRuntime {
  readonly dispatch: (command: EditorCommand) => Result<Transaction, CommandError>
  readonly getState: () => EditorState
  readonly subscribe: (listener: EditorStoreListener) => () => void
}

export function createEditor(initialState: EditorState): EditorRuntime {
  let currentState = initialState
  const listeners = new Set<EditorStoreListener>()

  return {
    dispatch(command) {
      const transactionResult = dispatchCommand(currentState, command)
      if (!transactionResult.ok) {
        return transactionResult
      }

      currentState = transactionResult.value.after

      for (const listener of listeners) {
        listener()
      }

      return ok(transactionResult.value)
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
