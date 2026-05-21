import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createEditorState,
  createTextInlineContent,
  dispatchCommand,
  validateDocument,
  type DocumentState,
  type ParagraphBlock,
  type Transaction,
} from '../src'

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
