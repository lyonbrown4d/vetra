import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  createDocument,
  createEditor,
  createEditorState,
  createEmptyHistoryState,
  createTextInlineContent,
  dispatchCommand,
  pushHistory,
  redoHistory,
  type Result,
  undoHistory,
  type ParagraphBlock,
  type Transaction,
} from '@vetra/core'

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function expectTransaction(transaction: ReturnType<typeof dispatchCommand>): Transaction {
  expect(transaction.ok).toBe(true)
  if (!transaction.ok) {
    throw new Error('Expected command to produce a transaction.')
  }

  return transaction.value
}

function expectRuntimeTransaction(transaction: Result<Transaction, unknown>): Transaction {
  expect(transaction.ok).toBe(true)
  if (!transaction.ok) {
    throw new Error('Expected runtime command to produce a transaction.')
  }

  return transaction.value
}

describe('history state helpers', () => {
  it('pushes transactions, undoes to before state, and redoes to after state', () => {
    const initialState = createEditorState(createDocument({ id: 'doc' }))
    const firstTransaction = expectTransaction(
      dispatchCommand(initialState, {
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-a', 'A'),
      }),
    )
    const secondTransaction = expectTransaction(
      dispatchCommand(firstTransaction.after, {
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-b', 'B'),
      }),
    )

    const history = pushHistory(
      pushHistory(createEmptyHistoryState(), firstTransaction),
      secondTransaction,
    )

    expect(canUndo(history)).toBe(true)
    expect(canRedo(history)).toBe(false)

    const undoSecond = undoHistory(history)
    expect(undoSecond.ok).toBe(true)
    if (!undoSecond.ok) {
      return
    }

    expect(undoSecond.value.state.document.children.root).toEqual(['block-a'])
    expect(undoSecond.value.transaction).toBe(secondTransaction)
    expect(undoSecond.value.history.undoStack).toHaveLength(1)
    expect(undoSecond.value.history.redoStack).toEqual([secondTransaction])

    const undoFirst = undoHistory(undoSecond.value.history)
    expect(undoFirst.ok).toBe(true)
    if (!undoFirst.ok) {
      return
    }

    expect(undoFirst.value.state.document.children.root).toEqual([])
    expect(undoFirst.value.history.undoStack).toHaveLength(0)
    expect(undoFirst.value.history.redoStack).toEqual([secondTransaction, firstTransaction])

    const redoFirst = redoHistory(undoFirst.value.history)
    expect(redoFirst.ok).toBe(true)
    if (!redoFirst.ok) {
      return
    }

    expect(redoFirst.value.state.document.children.root).toEqual(['block-a'])
    expect(redoFirst.value.history.undoStack).toEqual([firstTransaction])
    expect(redoFirst.value.history.redoStack).toEqual([secondTransaction])

    const redoSecond = redoHistory(redoFirst.value.history)
    expect(redoSecond.ok).toBe(true)
    if (!redoSecond.ok) {
      return
    }

    expect(redoSecond.value.state.document.children.root).toEqual(['block-a', 'block-b'])
    expect(redoSecond.value.history.undoStack).toEqual([firstTransaction, secondTransaction])
    expect(redoSecond.value.history.redoStack).toHaveLength(0)
  })

  it('clears redo stack when a new transaction is pushed after undo', () => {
    const initialState = createEditorState(createDocument({ id: 'doc' }))
    const firstTransaction = expectTransaction(
      dispatchCommand(initialState, {
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-a', 'A'),
      }),
    )
    const secondTransaction = expectTransaction(
      dispatchCommand(firstTransaction.after, {
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-b', 'B'),
      }),
    )
    const history = pushHistory(
      pushHistory(createEmptyHistoryState(), firstTransaction),
      secondTransaction,
    )
    const undoSecond = undoHistory(history)
    expect(undoSecond.ok).toBe(true)
    if (!undoSecond.ok) {
      return
    }

    const replacementTransaction = expectTransaction(
      dispatchCommand(undoSecond.value.state, {
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-c', 'C'),
      }),
    )

    const nextHistory = pushHistory(undoSecond.value.history, replacementTransaction)

    expect(nextHistory.undoStack).toEqual([firstTransaction, replacementTransaction])
    expect(nextHistory.redoStack).toEqual([])
    expect(canRedo(nextHistory)).toBe(false)
  })

  it('returns typed errors for empty undo and redo stacks', () => {
    const history = createEmptyHistoryState()

    expect(undoHistory(history)).toMatchObject({
      ok: false,
      error: { code: 'emptyUndoStack' },
    })
    expect(redoHistory(history)).toMatchObject({
      ok: false,
      error: { code: 'emptyRedoStack' },
    })
  })
})

describe('EditorRuntime history', () => {
  it('records insert, update, and delete commands for undo and redo', () => {
    const editor = createEditor(createEditorState(createDocument({ id: 'doc' })))
    let notifications = 0
    editor.subscribe(() => {
      notifications += 1
    })

    expect(editor.canUndo()).toBe(false)
    expect(editor.canRedo()).toBe(false)

    expectRuntimeTransaction(
      editor.dispatch({
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-a', 'A'),
      }),
    )
    expectRuntimeTransaction(
      editor.dispatch({
        type: 'updateBlock',
        blockId: 'block-a',
        patch: { content: createTextInlineContent('Updated') },
      }),
    )
    expectRuntimeTransaction(
      editor.dispatch({
        type: 'deleteBlock',
        blockId: 'block-a',
      }),
    )

    expect(editor.getState().document.children.root).toEqual([])
    expect(editor.canUndo()).toBe(true)
    expect(editor.canRedo()).toBe(false)

    expectRuntimeTransaction(editor.undo())
    expect(editor.getState().document.children.root).toEqual(['block-a'])
    expect(editor.getState().document.blocks['block-a']?.content).toEqual(
      createTextInlineContent('Updated'),
    )
    expect(editor.canRedo()).toBe(true)

    expectRuntimeTransaction(editor.undo())
    expect(editor.getState().document.blocks['block-a']?.content).toEqual(
      createTextInlineContent('A'),
    )

    expectRuntimeTransaction(editor.undo())
    expect(editor.getState().document.children.root).toEqual([])
    expect(editor.canUndo()).toBe(false)
    expect(editor.canRedo()).toBe(true)

    expectRuntimeTransaction(editor.redo())
    expect(editor.getState().document.children.root).toEqual(['block-a'])

    expectRuntimeTransaction(editor.redo())
    expect(editor.getState().document.blocks['block-a']?.content).toEqual(
      createTextInlineContent('Updated'),
    )

    expectRuntimeTransaction(editor.redo())
    expect(editor.getState().document.children.root).toEqual([])
    expect(editor.canUndo()).toBe(true)
    expect(editor.canRedo()).toBe(false)
    expect(notifications).toBe(9)
  })

  it('does not record selection-only commands in document undo history', () => {
    const editor = createEditor(
      createEditorState(createDocument({ id: 'doc', blocks: [paragraph('block-a', 'A')] })),
    )

    expectRuntimeTransaction(
      editor.dispatch({
        type: 'setSelection',
        selection: { type: 'block', blockId: 'block-a' },
      }),
    )

    expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-a' })
    expect(editor.canUndo()).toBe(false)
    expect(editor.canRedo()).toBe(false)

    expectRuntimeTransaction(
      editor.dispatch({
        type: 'updateBlock',
        blockId: 'block-a',
        patch: { content: createTextInlineContent('Updated') },
      }),
    )
    expectRuntimeTransaction(editor.undo())
    expect(editor.canRedo()).toBe(true)

    expectRuntimeTransaction(
      editor.dispatch({
        type: 'setSelection',
        selection: { type: 'none' },
      }),
    )

    expect(editor.canUndo()).toBe(false)
    expect(editor.canRedo()).toBe(true)
    expectRuntimeTransaction(editor.redo())
    expect(editor.getState().document.blocks['block-a']?.content).toEqual(
      createTextInlineContent('Updated'),
    )
  })

  it('clears redo history when a new document-changing command is dispatched after undo', () => {
    const editor = createEditor(createEditorState(createDocument({ id: 'doc' })))

    expectRuntimeTransaction(
      editor.dispatch({
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-a', 'A'),
      }),
    )
    expectRuntimeTransaction(
      editor.dispatch({
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-b', 'B'),
      }),
    )
    expectRuntimeTransaction(editor.undo())

    expect(editor.getState().document.children.root).toEqual(['block-a'])
    expect(editor.canRedo()).toBe(true)

    expectRuntimeTransaction(
      editor.dispatch({
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-c', 'C'),
      }),
    )

    expect(editor.getState().document.children.root).toEqual(['block-a', 'block-c'])
    expect(editor.canRedo()).toBe(false)
    expect(editor.redo()).toMatchObject({
      ok: false,
      error: { code: 'emptyRedoStack' },
    })
  })

  it('returns typed errors for empty runtime undo and redo stacks without notifying subscribers', () => {
    const editor = createEditor(createEditorState(createDocument({ id: 'doc' })))
    let notifications = 0
    editor.subscribe(() => {
      notifications += 1
    })

    expect(editor.undo()).toMatchObject({
      ok: false,
      error: { code: 'emptyUndoStack' },
    })
    expect(editor.redo()).toMatchObject({
      ok: false,
      error: { code: 'emptyRedoStack' },
    })
    expect(notifications).toBe(0)
  })
})
