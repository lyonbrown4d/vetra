import { describe, expect, it } from 'vitest'
import {
  createEditor,
  createDocument,
  createEditorState,
  createTextInlineContent,
  dispatchCommand,
  validateDocument,
  type DocumentState,
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

function nestedDocument(): DocumentState {
  return {
    id: 'doc',
    version: 1,
    rootId: 'root',
    blocks: {
      root: { id: 'root', type: 'root' },
      parent: paragraph('parent', 'Parent'),
      child: paragraph('child', 'Child'),
      sibling: paragraph('sibling', 'Sibling'),
    },
    children: {
      root: ['parent', 'sibling'],
      parent: ['child'],
      child: [],
      sibling: [],
    },
  }
}

function batchDeleteDocument(): DocumentState {
  return {
    id: 'doc',
    version: 1,
    rootId: 'root',
    blocks: {
      root: { id: 'root', type: 'root' },
      'block-a': paragraph('block-a', 'A'),
      'block-b': paragraph('block-b', 'B'),
      'block-c': paragraph('block-c', 'C'),
      'block-d': paragraph('block-d', 'D'),
      'child-a': paragraph('child-a', 'Child A'),
      'child-b': paragraph('child-b', 'Child B'),
    },
    children: {
      root: ['block-a', 'block-b', 'block-c', 'block-d'],
      'block-a': [],
      'block-b': ['child-a', 'child-b'],
      'block-c': [],
      'block-d': [],
      'child-a': [],
      'child-b': [],
    },
  }
}

function expectTransaction(result: ReturnType<typeof dispatchCommand>): Transaction {
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`Expected command to succeed, received ${result.error.code}.`)
  }

  return result.value
}

function expectValidDocument(document: DocumentState): void {
  const validation = validateDocument(document)
  expect(validation.ok).toBe(true)
  if (!validation.ok) {
    throw new Error(validation.error.map((error) => error.code).join(', '))
  }
}

describe('core command dispatch v2 insert commands', () => {
  it('inserts sibling blocks before and after a stable reference block id', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-d', 'D')],
    })
    const insertedBefore = expectTransaction(
      dispatchCommand(createEditorState(document), {
        type: 'insertBlockBefore',
        referenceBlockId: 'block-d',
        block: paragraph('block-b', 'B'),
      }),
    )
    const insertedAfter = expectTransaction(
      dispatchCommand(insertedBefore.after, {
        type: 'insertBlockAfter',
        referenceBlockId: 'block-b',
        block: paragraph('block-c', 'C'),
      }),
    )

    expect(insertedAfter.after.document.children.root).toEqual([
      'block-a',
      'block-b',
      'block-c',
      'block-d',
    ])
    expectValidDocument(insertedAfter.after.document)
  })

  it('rejects invalid sibling references and invalid insertion indexes', () => {
    const state = createEditorState(createDocument({ id: 'doc' }))

    expect(
      dispatchCommand(state, {
        type: 'insertBlockAfter',
        referenceBlockId: 'missing',
        block: paragraph('block-a', 'A'),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockNotFound' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlockBefore',
        referenceBlockId: 'root',
        block: paragraph('block-a', 'A'),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidParent' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlock',
        parentId: 'root',
        block: paragraph('block-a', 'A'),
        index: 1,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidIndex' },
    })
  })

  it('inserts a multi-root block fragment as one document transaction', () => {
    const editor = createEditor(
      createEditorState(
        createDocument({
          id: 'doc',
          blocks: [paragraph('anchor', 'Anchor'), paragraph('tail', 'Tail')],
        }),
      ),
    )

    const inserted = editor.dispatch({
      type: 'insertBlockFragment',
      parentId: 'root',
      index: 1,
      rootBlockIds: ['paste-a', 'paste-b'],
      blocks: {
        'paste-a': paragraph('paste-a', 'Pasted A'),
        'paste-b': paragraph('paste-b', 'Pasted B'),
      },
      children: {
        'paste-a': [],
        'paste-b': [],
      },
    })

    expect(inserted.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'anchor',
      'paste-a',
      'paste-b',
      'tail',
    ])
    expect(editor.getState().document.version).toBe(2)
    expect(editor.canUndo()).toBe(true)

    const undone = editor.undo()

    expect(undone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual(['anchor', 'tail'])
    expect(editor.canRedo()).toBe(true)

    const redone = editor.redo()

    expect(redone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'anchor',
      'paste-a',
      'paste-b',
      'tail',
    ])
    expectValidDocument(editor.getState().document)
  })

  it('inserts a nested block fragment and preserves subtree children', () => {
    const transaction = expectTransaction(
      dispatchCommand(createEditorState(nestedDocument()), {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 1,
        rootBlockIds: ['pasted-parent'],
        blocks: {
          'pasted-parent': paragraph('pasted-parent', 'Pasted parent'),
          'pasted-child': paragraph('pasted-child', 'Pasted child'),
        },
        children: {
          'pasted-parent': ['pasted-child'],
          'pasted-child': [],
        },
        selection: { type: 'block', blockId: 'pasted-child' },
      }),
    )

    expect(transaction.after.document.children.root).toEqual(['parent', 'pasted-parent', 'sibling'])
    expect(transaction.after.document.children['pasted-parent']).toEqual(['pasted-child'])
    expect(transaction.after.document.children['pasted-child']).toEqual([])
    expect(transaction.after.selection).toEqual({ type: 'block', blockId: 'pasted-child' })
    expect(transaction.changedBlockIds).toEqual(['root', 'pasted-parent', 'pasted-child'])
    expectValidDocument(transaction.after.document)
  })

  it('replaces a contiguous block range with a fragment as one history step', () => {
    const editor = createEditor(
      createEditorState(
        createDocument({
          id: 'doc',
          blocks: [
            paragraph('block-a', 'A'),
            paragraph('block-b', 'B'),
            paragraph('block-c', 'C'),
            paragraph('block-d', 'D'),
          ],
        }),
      ),
    )

    const inserted = editor.dispatch({
      type: 'insertBlockFragment',
      parentId: 'root',
      index: 1,
      replaceBlockIds: ['block-b', 'block-c'],
      rootBlockIds: ['paste-a', 'paste-b'],
      blocks: {
        'paste-a': paragraph('paste-a', 'Pasted A'),
        'paste-b': paragraph('paste-b', 'Pasted B'),
      },
      children: {
        'paste-a': [],
        'paste-b': [],
      },
      selection: { type: 'block', blockId: 'paste-b' },
    })

    expect(inserted.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'block-a',
      'paste-a',
      'paste-b',
      'block-d',
    ])
    expect(editor.getState().document.blocks['block-b']).toBeUndefined()
    expect(editor.getState().document.blocks['block-c']).toBeUndefined()
    expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'paste-b' })

    const undone = editor.undo()

    expect(undone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'block-a',
      'block-b',
      'block-c',
      'block-d',
    ])
  })

  it('rejects invalid block fragments without partial insertion', () => {
    const state = createEditorState(nestedDocument())

    expect(
      dispatchCommand(state, {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 99,
        rootBlockIds: ['paste-a'],
        blocks: { 'paste-a': paragraph('paste-a', 'A') },
        children: { 'paste-a': [] },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidIndex' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 1,
        rootBlockIds: ['paste-a'],
        blocks: { 'paste-a': paragraph('paste-a', 'A') },
        children: { 'paste-a': ['missing-child'] },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockFragment' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 1,
        rootBlockIds: ['paste-a'],
        blocks: {
          'paste-a': paragraph('paste-a', 'A'),
          'paste-b': paragraph('paste-b', 'B'),
        },
        children: {
          'paste-a': ['paste-b'],
          'paste-b': ['paste-b'],
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockFragment' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 1,
        rootBlockIds: ['paste-a'],
        blocks: { 'paste-a': { ...paragraph('paste-a-actual', 'A') } },
        children: { 'paste-a': [] },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockFragment' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 1,
        rootBlockIds: ['paste-a'],
        blocks: {
          'paste-a': paragraph('paste-a', 'A'),
          orphan: paragraph('orphan', 'Orphan'),
        },
        children: {
          'paste-a': [],
          orphan: [],
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockFragment' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 1,
        rootBlockIds: ['paste-a', 'paste-a'],
        blocks: { 'paste-a': paragraph('paste-a', 'A') },
        children: { 'paste-a': [] },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockFragment' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 1,
        rootBlockIds: ['parent'],
        blocks: { parent: paragraph('parent', 'Existing') },
        children: { parent: [] },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockAlreadyExists' },
    })
    expect(
      dispatchCommand(state, {
        type: 'insertBlockFragment',
        parentId: 'root',
        index: 0,
        replaceBlockIds: ['sibling'],
        rootBlockIds: ['paste-a'],
        blocks: { 'paste-a': paragraph('paste-a', 'A') },
        children: { 'paste-a': [] },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockFragment' },
    })
    expect(state.document.children.root).toEqual(['parent', 'sibling'])
  })
})

describe('core command dispatch v2 deleteBlocks', () => {
  it('deletes duplicate ids and descendant requests while preserving tree consistency', () => {
    const selected = expectTransaction(
      dispatchCommand(createEditorState(batchDeleteDocument()), {
        type: 'setSelection',
        selection: {
          type: 'range-block',
          anchorBlockId: 'block-a',
          focusBlockId: 'block-d',
        },
      }),
    )
    const transaction = expectTransaction(
      dispatchCommand(selected.after, {
        type: 'deleteBlocks',
        blockIds: ['block-b', 'block-c', 'block-b', 'child-a'],
      }),
    )

    expect(transaction.after.document.children.root).toEqual(['block-a', 'block-d'])
    expect(transaction.after.document.blocks['block-b']).toBeUndefined()
    expect(transaction.after.document.blocks['block-c']).toBeUndefined()
    expect(transaction.after.document.blocks['child-a']).toBeUndefined()
    expect(transaction.after.document.blocks['child-b']).toBeUndefined()
    expect(transaction.after.document.children['block-b']).toBeUndefined()
    expect(transaction.after.document.children['child-a']).toBeUndefined()
    expect(transaction.after.selection).toEqual({ type: 'none' })
    expect(new Set(transaction.changedBlockIds)).toEqual(
      new Set(['root', 'block-b', 'block-c', 'child-a', 'child-b']),
    )
    expect(transaction.changedBlockIds).toHaveLength(new Set(transaction.changedBlockIds).size)
    expectValidDocument(transaction.after.document)
  })

  it('records deleteBlocks undo and redo as one history step', () => {
    const editor = createEditor(
      createEditorState(
        createDocument({
          id: 'doc',
          blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B'), paragraph('block-c', 'C')],
        }),
      ),
    )

    const deleted = editor.dispatch({
      type: 'deleteBlocks',
      blockIds: ['block-b', 'block-c'],
    })

    expect(deleted.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual(['block-a'])
    expect(editor.canUndo()).toBe(true)

    const undone = editor.undo()

    expect(undone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual(['block-a', 'block-b', 'block-c'])
    expect(editor.canRedo()).toBe(true)

    const redone = editor.redo()

    expect(redone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual(['block-a'])
  })

  it('rejects root, missing, and detached block ids without partial deletion', () => {
    const state = createEditorState(
      createDocument({ id: 'doc', blocks: [paragraph('block-a', 'A')] }),
    )

    expect(
      dispatchCommand(state, {
        type: 'deleteBlocks',
        blockIds: ['block-a', 'root'],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'cannotDeleteRoot' },
    })
    expect(
      dispatchCommand(state, {
        type: 'deleteBlocks',
        blockIds: ['block-a', 'missing'],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockNotFound' },
    })
    expect(state.document.children.root).toEqual(['block-a'])

    const detachedState = createEditorState({
      id: 'doc',
      version: 1,
      rootId: 'root',
      blocks: {
        root: { id: 'root', type: 'root' },
        detached: paragraph('detached', 'Detached'),
      },
      children: {
        root: [],
        detached: [],
      },
    })

    expect(
      dispatchCommand(detachedState, {
        type: 'deleteBlocks',
        blockIds: ['detached'],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidParent' },
    })
    expect(detachedState.document.blocks.detached).toBeDefined()
  })
})

describe('core command dispatch v2 duplicateBlock', () => {
  it('duplicates a subtree with caller-provided id mapping', () => {
    const transaction = expectTransaction(
      dispatchCommand(createEditorState(nestedDocument()), {
        type: 'duplicateBlock',
        blockId: 'parent',
        idMap: {
          parent: 'parent-copy',
          child: 'child-copy',
        },
      }),
    )

    expect(transaction.after.document.children.root).toEqual(['parent', 'parent-copy', 'sibling'])
    expect(transaction.after.document.children['parent-copy']).toEqual(['child-copy'])
    expect(transaction.after.document.children['child-copy']).toEqual([])
    expect(transaction.after.document.blocks['parent-copy']).toMatchObject({
      id: 'parent-copy',
      type: 'paragraph',
      content: createTextInlineContent('Parent'),
    })
    expectValidDocument(transaction.after.document)
  })

  it('duplicates a leaf block from a caller-provided replacement block', () => {
    const transaction = expectTransaction(
      dispatchCommand(createEditorState(nestedDocument()), {
        type: 'duplicateBlock',
        blockId: 'sibling',
        placement: 'before',
        block: paragraph('sibling-copy', 'Sibling copy'),
      }),
    )

    expect(transaction.after.document.children.root).toEqual(['parent', 'sibling-copy', 'sibling'])
    expect(transaction.after.document.children['sibling-copy']).toEqual([])
    expectValidDocument(transaction.after.document)
  })

  it('rejects duplicate commands without complete caller-provided ids', () => {
    const state = createEditorState(nestedDocument())

    expect(
      dispatchCommand(state, {
        type: 'duplicateBlock',
        blockId: 'parent',
        idMap: { parent: 'parent-copy' },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidDuplicateSubtree' },
    })
    expect(
      dispatchCommand(state, {
        type: 'duplicateBlock',
        blockId: 'parent',
        block: paragraph('parent-copy', 'Parent copy'),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidDuplicateSubtree' },
    })
    expect(
      dispatchCommand(state, {
        type: 'duplicateBlock',
        blockId: 'sibling',
        block: paragraph('parent', 'Existing id'),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockAlreadyExists' },
    })
  })
})

describe('core command dispatch v2 duplicateBlocks', () => {
  it('duplicates a sibling range with subtrees as one history step', () => {
    const editor = createEditor(createEditorState(batchDeleteDocument()))

    const duplicated = editor.dispatch({
      type: 'duplicateBlocks',
      blockIds: ['block-b', 'child-a', 'block-c'],
      idMap: {
        'block-b': 'block-b-copy',
        'child-a': 'child-a-copy',
        'child-b': 'child-b-copy',
        'block-c': 'block-c-copy',
      },
    })

    expect(duplicated.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'block-a',
      'block-b',
      'block-c',
      'block-b-copy',
      'block-c-copy',
      'block-d',
    ])
    expect(editor.getState().document.children['block-b-copy']).toEqual([
      'child-a-copy',
      'child-b-copy',
    ])
    expect(editor.getState().document.children['block-c-copy']).toEqual([])
    expect(editor.getState().document.blocks['block-b-copy']).toMatchObject({
      id: 'block-b-copy',
      type: 'paragraph',
      content: createTextInlineContent('B'),
    })
    expect(editor.canUndo()).toBe(true)

    const undone = editor.undo()

    expect(undone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'block-a',
      'block-b',
      'block-c',
      'block-d',
    ])
    expect(editor.getState().document.blocks['block-b-copy']).toBeUndefined()
    expect(editor.canRedo()).toBe(true)

    const redone = editor.redo()

    expect(redone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'block-a',
      'block-b',
      'block-c',
      'block-b-copy',
      'block-c-copy',
      'block-d',
    ])
    expectValidDocument(editor.getState().document)
  })

  it('duplicates a sibling range before the first selected block', () => {
    const transaction = expectTransaction(
      dispatchCommand(createEditorState(batchDeleteDocument()), {
        type: 'duplicateBlocks',
        blockIds: ['block-c', 'block-b'],
        placement: 'before',
        selection: {
          type: 'range-block',
          anchorBlockId: 'block-b-copy',
          focusBlockId: 'block-c-copy',
        },
        idMap: {
          'block-b': 'block-b-copy',
          'child-a': 'child-a-copy',
          'child-b': 'child-b-copy',
          'block-c': 'block-c-copy',
        },
      }),
    )

    expect(transaction.after.document.children.root).toEqual([
      'block-a',
      'block-b-copy',
      'block-c-copy',
      'block-b',
      'block-c',
      'block-d',
    ])
    expect(transaction.after.document.children['block-b-copy']).toEqual([
      'child-a-copy',
      'child-b-copy',
    ])
    expect(transaction.after.selection).toEqual({
      type: 'range-block',
      anchorBlockId: 'block-b-copy',
      focusBlockId: 'block-c-copy',
    })
    expectValidDocument(transaction.after.document)
  })

  it('rejects invalid duplicateBlocks commands without partial mutation', () => {
    const state = createEditorState(batchDeleteDocument())

    expect(
      dispatchCommand(state, {
        type: 'duplicateBlocks',
        blockIds: ['root'],
        idMap: { root: 'root-copy' },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'cannotDuplicateRoot' },
    })
    expect(
      dispatchCommand(state, {
        type: 'duplicateBlocks',
        blockIds: ['missing'],
        idMap: { missing: 'missing-copy' },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockNotFound' },
    })
    expect(
      dispatchCommand(state, {
        type: 'duplicateBlocks',
        blockIds: ['block-a', 'child-a'],
        idMap: {
          'block-a': 'block-a-copy',
          'child-a': 'child-a-copy',
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidParent' },
    })
    expect(
      dispatchCommand(state, {
        type: 'duplicateBlocks',
        blockIds: ['block-a', 'block-c'],
        idMap: {
          'block-a': 'block-a-copy',
          'block-c': 'block-c-copy',
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockRange' },
    })
    expect(
      dispatchCommand(state, {
        type: 'duplicateBlocks',
        blockIds: ['block-b'],
        idMap: {
          'block-b': 'block-b-copy',
          'child-a': 'child-a-copy',
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidDuplicateSubtree' },
    })
    expect(
      dispatchCommand(state, {
        type: 'duplicateBlocks',
        blockIds: ['block-b'],
        idMap: {
          'block-b': 'block-b-copy',
          'child-a': 'child-copy',
          'child-b': 'child-copy',
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidDuplicateSubtree' },
    })
    expect(
      dispatchCommand(state, {
        type: 'duplicateBlocks',
        blockIds: ['block-b'],
        idMap: {
          'block-b': 'block-b-copy',
          'child-a': 'child-a-copy',
          'child-b': 'block-a',
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockAlreadyExists' },
    })
    expect(state.document.children.root).toEqual(['block-a', 'block-b', 'block-c', 'block-d'])
    expect(state.document.blocks['block-b-copy']).toBeUndefined()
  })
})

describe('core command dispatch v2 moveBlocks', () => {
  it('moves a contiguous sibling range as one history step', () => {
    const editor = createEditor(createEditorState(batchDeleteDocument()))

    const moved = editor.dispatch({
      type: 'moveBlocks',
      blockIds: ['block-b', 'block-c'],
      toParentId: 'root',
      toIndex: 2,
      selection: { type: 'range-block', anchorBlockId: 'block-b', focusBlockId: 'block-c' },
    })

    expect(moved.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'block-a',
      'block-d',
      'block-b',
      'block-c',
    ])
    expect(editor.getState().document.children['block-b']).toEqual(['child-a', 'child-b'])
    expect(editor.getState().selection).toEqual({
      type: 'range-block',
      anchorBlockId: 'block-b',
      focusBlockId: 'block-c',
    })
    expect(editor.canUndo()).toBe(true)

    const undone = editor.undo()

    expect(undone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'block-a',
      'block-b',
      'block-c',
      'block-d',
    ])
    expect(editor.canRedo()).toBe(true)

    const redone = editor.redo()

    expect(redone.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'block-a',
      'block-d',
      'block-b',
      'block-c',
    ])
    expectValidDocument(editor.getState().document)
  })

  it('moves a sibling range into another parent at the requested index', () => {
    const transaction = expectTransaction(
      dispatchCommand(createEditorState(batchDeleteDocument()), {
        type: 'moveBlocks',
        blockIds: ['block-c', 'block-d'],
        toParentId: 'block-b',
        toIndex: 1,
      }),
    )

    expect(transaction.after.document.children.root).toEqual(['block-a', 'block-b'])
    expect(transaction.after.document.children['block-b']).toEqual([
      'child-a',
      'block-c',
      'block-d',
      'child-b',
    ])
    expectValidDocument(transaction.after.document)
  })

  it('rejects invalid moveBlocks commands without partial mutation', () => {
    const state = createEditorState(batchDeleteDocument())

    expect(
      dispatchCommand(state, {
        type: 'moveBlocks',
        blockIds: ['root'],
        toParentId: 'root',
        toIndex: 0,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'cannotMoveRoot' },
    })
    expect(
      dispatchCommand(state, {
        type: 'moveBlocks',
        blockIds: ['missing'],
        toParentId: 'root',
        toIndex: 0,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockNotFound' },
    })
    expect(
      dispatchCommand(state, {
        type: 'moveBlocks',
        blockIds: ['block-a', 'child-a'],
        toParentId: 'root',
        toIndex: 0,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidParent' },
    })
    expect(
      dispatchCommand(state, {
        type: 'moveBlocks',
        blockIds: ['block-a', 'block-c'],
        toParentId: 'root',
        toIndex: 0,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockRange' },
    })
    expect(
      dispatchCommand(state, {
        type: 'moveBlocks',
        blockIds: ['block-b'],
        toParentId: 'child-a',
        toIndex: 0,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidParent' },
    })
    expect(
      dispatchCommand(state, {
        type: 'moveBlocks',
        blockIds: ['block-b', 'block-c'],
        toParentId: 'root',
        toIndex: 99,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidIndex' },
    })
    expect(state.document.children.root).toEqual(['block-a', 'block-b', 'block-c', 'block-d'])
    expect(state.document.children['block-b']).toEqual(['child-a', 'child-b'])
  })
})

describe('core command dispatch v2 convertBlockType', () => {
  it('converts a block type while preserving the stable block id and children', () => {
    const transaction = expectTransaction(
      dispatchCommand(createEditorState(nestedDocument()), {
        type: 'convertBlockType',
        blockId: 'parent',
        blockType: 'heading',
        props: { level: 2 },
        content: createTextInlineContent('Heading'),
        updatedAt: 100,
      }),
    )

    expect(transaction.after.document.blocks.parent).toMatchObject({
      id: 'parent',
      type: 'heading',
      props: { level: 2 },
      content: createTextInlineContent('Heading'),
      updatedAt: 100,
    })
    expect(transaction.after.document.children.parent).toEqual(['child'])
    expectValidDocument(transaction.after.document)
  })

  it('rejects invalid conversion targets and block types', () => {
    const state = createEditorState(createDocument({ id: 'doc' }))
    const documentWithBlock = createEditorState(
      createDocument({ id: 'doc', blocks: [paragraph('block-a', 'A')] }),
    )

    expect(
      dispatchCommand(state, {
        type: 'convertBlockType',
        blockId: 'root',
        blockType: 'paragraph',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'cannotConvertRoot' },
    })
    expect(
      dispatchCommand(state, {
        type: 'convertBlockType',
        blockId: 'missing',
        blockType: 'paragraph',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockNotFound' },
    })
    expect(
      dispatchCommand(documentWithBlock, {
        type: 'convertBlockType',
        blockId: 'block-a',
        blockType: '',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidBlockType' },
    })
  })
})

describe('core command dispatch v2 splitBlock', () => {
  it('splits a block by applying caller-provided before and after content', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'Hello'), paragraph('block-c', 'C')],
    })
    const transaction = expectTransaction(
      dispatchCommand(createEditorState(document), {
        type: 'splitBlock',
        blockId: 'block-a',
        beforeContent: createTextInlineContent('Hel'),
        afterBlock: paragraph('block-b', 'lo'),
      }),
    )

    expect(transaction.after.document.children.root).toEqual(['block-a', 'block-b', 'block-c'])
    expect(transaction.after.document.blocks['block-a']?.content).toEqual(
      createTextInlineContent('Hel'),
    )
    expect(transaction.after.document.blocks['block-b']?.content).toEqual(
      createTextInlineContent('lo'),
    )
    expectValidDocument(transaction.after.document)
  })

  it('rejects invalid split targets and duplicate after block ids', () => {
    const document = createDocument({ id: 'doc', blocks: [paragraph('block-a', 'A')] })
    const state = createEditorState(document)

    expect(
      dispatchCommand(state, {
        type: 'splitBlock',
        blockId: 'root',
        afterBlock: paragraph('block-b', 'B'),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidSplitTarget' },
    })
    expect(
      dispatchCommand(state, {
        type: 'splitBlock',
        blockId: 'block-a',
        afterBlock: paragraph('block-a', 'Duplicate'),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'blockAlreadyExists' },
    })
  })
})

describe('core command dispatch v2 mergeBlock', () => {
  it('merges adjacent leaf siblings with caller-provided merged content', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B'), paragraph('block-c', 'C')],
    })
    const selected = expectTransaction(
      dispatchCommand(createEditorState(document), {
        type: 'setSelection',
        selection: { type: 'block', blockId: 'block-b' },
      }),
    )
    const transaction = expectTransaction(
      dispatchCommand(selected.after, {
        type: 'mergeBlock',
        targetBlockId: 'block-a',
        sourceBlockId: 'block-b',
        mergedContent: createTextInlineContent('AB'),
      }),
    )

    expect(transaction.after.document.children.root).toEqual(['block-a', 'block-c'])
    expect(transaction.after.document.blocks['block-a']?.content).toEqual(
      createTextInlineContent('AB'),
    )
    expect(transaction.after.document.blocks['block-b']).toBeUndefined()
    expect(transaction.after.selection).toEqual({ type: 'none' })
    expectValidDocument(transaction.after.document)
  })

  it('rejects non-adjacent merge targets and source blocks with children', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B'), paragraph('block-c', 'C')],
    })
    const state = createEditorState(document)

    expect(
      dispatchCommand(state, {
        type: 'mergeBlock',
        targetBlockId: 'block-a',
        sourceBlockId: 'block-c',
        mergedContent: createTextInlineContent('AC'),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidMergeTarget' },
    })
    expect(
      dispatchCommand(createEditorState(nestedDocument()), {
        type: 'mergeBlock',
        targetBlockId: 'sibling',
        sourceBlockId: 'parent',
        mergedContent: createTextInlineContent('Merged'),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidMergeTarget' },
    })
  })
})
