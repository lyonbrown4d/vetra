import { describe, expect, it } from 'vitest'
import { stringifyDocument } from '@vetra/persistence-json'
import {
  createDocument,
  createEditor,
  createEditorState,
  createTextInlineContent,
  type DocBlock,
  type DocumentState,
  type HeadingBlock,
  type InlineContent,
  type ParagraphBlock,
  type Result,
} from '@vetra/core'
import {
  createDocumentPasteStrategy,
  createPasteHandler,
  markdownPasteKind,
  pasteClipboardPayloadIntoEditor,
  type PasteError,
  type PasteResult,
} from '@vetra/react'

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function heading(id: string, text: string): HeadingBlock {
  return {
    id,
    type: 'heading',
    props: { level: 1 },
    content: createTextInlineContent(text),
  }
}

function expectPasteOk(result: Result<PasteResult, PasteError>): PasteResult {
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.value
}

function blockText(block: DocBlock | undefined): string {
  const inlineContent = block?.content as InlineContent | undefined
  const firstChild = inlineContent?.children[0]

  return firstChild?.type === 'text' ? firstChild.text : ''
}

describe('paste handler', () => {
  it('pastes single plain text content after the reference block', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor'), paragraph('tail', 'Tail')],
    })
    const editor = createEditor(createEditorState(document))
    const handlePaste = createPasteHandler({
      editor,
      target: { referenceBlockId: 'anchor' },
      idFactory: ({ index }) => `paste-${String(index)}`,
    })

    const result = expectPasteOk(handlePaste({ text: 'Inserted' }))

    expect(result.handled).toBe(true)
    expect(result.insertedBlockIds).toEqual(['paste-0'])
    expect(editor.getState().document.children.root).toEqual(['anchor', 'paste-0', 'tail'])
    expect(blockText(editor.getState().document.blocks['paste-0'])).toBe('Inserted')
  })

  it('pastes multiple plain text paragraphs in source order', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor'), paragraph('tail', 'Tail')],
    })
    const editor = createEditor(createEditorState(document))
    const handlePaste = createPasteHandler({
      editor,
      target: { referenceBlockId: 'anchor' },
      idFactory: ({ index }) => `paste-${String(index + 1)}`,
    })

    const result = expectPasteOk(handlePaste({ text: 'First\nwrapped\n\nSecond' }))

    expect(result.insertedBlockIds).toEqual(['paste-1', 'paste-2'])
    expect(editor.getState().document.children.root).toEqual([
      'anchor',
      'paste-1',
      'paste-2',
      'tail',
    ])
    expect(blockText(editor.getState().document.blocks['paste-1'])).toBe('First\nwrapped')
    expect(blockText(editor.getState().document.blocks['paste-2'])).toBe('Second')
  })

  it('records multi paragraph plain text paste as one undo step', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor'), paragraph('tail', 'Tail')],
    })
    const editor = createEditor(createEditorState(document))
    const handlePaste = createPasteHandler({
      editor,
      target: { referenceBlockId: 'anchor' },
      idFactory: ({ index }) => `paste-${String(index + 1)}`,
    })

    const result = expectPasteOk(handlePaste({ text: 'First\n\nSecond' }))

    expect(result.insertedBlockIds).toEqual(['paste-1', 'paste-2'])
    expect(result.transactions).toHaveLength(1)
    expect(editor.getState().document.children.root).toEqual([
      'anchor',
      'paste-1',
      'paste-2',
      'tail',
    ])

    const undoResult = editor.undo()

    expect(undoResult.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual(['anchor', 'tail'])
    expect(editor.getState().document.blocks['paste-1']).toBeUndefined()
    expect(editor.getState().document.blocks['paste-2']).toBeUndefined()
  })

  it('replaces target blocks while inserting a paste fragment as one undo step', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [
        paragraph('before', 'Before'),
        paragraph('replace-a', 'Replace A'),
        paragraph('replace-b', 'Replace B'),
        paragraph('after', 'After'),
      ],
    })
    const editor = createEditor(createEditorState(document))
    const handlePaste = createPasteHandler({
      editor,
      target: {
        referenceBlockId: 'replace-a',
        placement: 'before',
        replaceBlockIds: ['replace-a', 'replace-b'],
      },
      idFactory: ({ index }) => `paste-${String(index + 1)}`,
    })

    const result = expectPasteOk(handlePaste({ text: 'Inserted' }))

    expect(result.insertedBlockIds).toEqual(['paste-1'])
    expect(result.transactions).toHaveLength(1)
    expect(editor.getState().document.children.root).toEqual(['before', 'paste-1', 'after'])
    expect(editor.getState().document.blocks['replace-a']).toBeUndefined()
    expect(editor.getState().document.blocks['replace-b']).toBeUndefined()

    const undoResult = editor.undo()

    expect(undoResult.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual([
      'before',
      'replace-a',
      'replace-b',
      'after',
    ])
  })

  it('treats empty paste as a no-op', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor')],
    })
    const editor = createEditor(createEditorState(document))
    const handlePaste = createPasteHandler({
      editor,
      target: { referenceBlockId: 'anchor' },
      idFactory: ({ index }) => `paste-${String(index)}`,
    })

    const result = expectPasteOk(handlePaste({ text: '' }))

    expect(result.handled).toBe(false)
    expect(result.insertedBlockIds).toEqual([])
    expect(result.transactions).toEqual([])
    expect(editor.getState().document).toBe(document)
  })

  it('returns an error for an invalid reference without changing the document', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor')],
    })
    const editor = createEditor(createEditorState(document))
    const handlePaste = createPasteHandler({
      editor,
      target: { referenceBlockId: 'missing' },
      idFactory: ({ index }) => `paste-${String(index)}`,
    })

    const result = handlePaste({ text: 'Inserted' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('blockNotFound')
    }
    expect(editor.getState().document).toBe(document)
  })

  it('uses an explicit strategy for markdown without guessing from plain text', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor')],
    })
    const editor = createEditor(createEditorState(document))
    const markdownStrategy = createDocumentPasteStrategy((input, context) =>
      createDocument({
        id: 'markdown-paste',
        blocks: [
          heading(
            context.idFactory({
              index: 0,
              text: input.text,
              kind: input.kind,
            }),
            'Title',
          ),
        ],
      }),
    )
    const handlePaste = createPasteHandler({
      editor,
      target: { referenceBlockId: 'anchor' },
      strategy: markdownStrategy,
      idFactory: ({ kind }) => `pasted-${kind}`,
    })

    const result = expectPasteOk(handlePaste({ text: '# Title', kind: markdownPasteKind }))

    expect(result.insertedBlockIds).toEqual(['pasted-markdown'])
    expect(editor.getState().document.blocks['pasted-markdown']?.type).toBe('heading')
    expect(blockText(editor.getState().document.blocks['pasted-markdown'])).toBe('Title')
  })

  it('rejects clipboard subtree id collisions before changing the document', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor')],
    })
    const editor = createEditor(createEditorState(document))
    const clipboardRootId = '__clipboard-root__'
    const sourceDocument: DocumentState = {
      id: 'clipboard-doc',
      version: 1,
      rootId: clipboardRootId,
      blocks: {
        [clipboardRootId]: { id: clipboardRootId, type: 'root' },
        'source-parent': paragraph('source-parent', 'Parent'),
        'source-child': paragraph('source-child', 'Child'),
      },
      children: {
        [clipboardRootId]: ['source-parent'],
        'source-parent': ['source-child'],
        'source-child': [],
      },
    }

    const result = pasteClipboardPayloadIntoEditor({
      editor,
      target: { referenceBlockId: 'anchor' },
      payload: stringifyDocument(sourceDocument),
      idFactory: () => 'duplicate-paste-id',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('pasteDuplicateBlockId')
    }
    expect(editor.getState().document).toBe(document)
    expect(editor.getState().document.children.root).toEqual(['anchor'])
    expect(editor.getState().document.blocks['duplicate-paste-id']).toBeUndefined()
  })

  it('returns a clipboard paste error when the id factory throws', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor')],
    })
    const editor = createEditor(createEditorState(document))
    const sourceDocument = createDocument({
      id: 'clipboard-doc',
      rootId: '__clipboard-root__',
      blocks: [paragraph('source-block', 'Copied')],
    })

    const result = pasteClipboardPayloadIntoEditor({
      editor,
      target: { referenceBlockId: 'anchor' },
      payload: stringifyDocument(sourceDocument),
      idFactory: () => {
        throw new Error('Cannot allocate paste id.')
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('pasteStrategyFailed')
      expect(result.error.message).toBe('Cannot allocate paste id.')
    }
    expect(editor.getState().document).toBe(document)
  })

  it('rejects malformed clipboard payloads without changing the document', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor')],
    })
    const editor = createEditor(createEditorState(document))

    const result = pasteClipboardPayloadIntoEditor({
      editor,
      target: { referenceBlockId: 'anchor' },
      payload: '{not valid json',
      idFactory: ({ index }) => `paste-${String(index)}`,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('pasteStrategyFailed')
    }
    expect(editor.getState().document).toBe(document)
    expect(editor.getState().document.children.root).toEqual(['anchor'])
  })

  it('pastes a nested clipboard document as one undo step', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor'), paragraph('tail', 'Tail')],
    })
    const editor = createEditor(createEditorState(document))
    const clipboardRootId = '__clipboard-root__'
    const sourceDocument: DocumentState = {
      id: 'clipboard-doc',
      version: 1,
      rootId: clipboardRootId,
      blocks: {
        [clipboardRootId]: { id: clipboardRootId, type: 'root' },
        'source-parent': paragraph('source-parent', 'Parent'),
        'source-child': paragraph('source-child', 'Child'),
      },
      children: {
        [clipboardRootId]: ['source-parent'],
        'source-parent': ['source-child'],
        'source-child': [],
      },
    }

    const result = expectPasteOk(
      pasteClipboardPayloadIntoEditor({
        editor,
        target: { referenceBlockId: 'anchor' },
        payload: stringifyDocument(sourceDocument),
        idFactory: ({ index }) => `paste-${String(index)}`,
      }),
    )

    expect(result.insertedBlockIds).toEqual(['paste-0'])
    expect(result.transactions).toHaveLength(1)
    expect(editor.getState().document.children.root).toEqual(['anchor', 'paste-0', 'tail'])
    expect(editor.getState().document.children['paste-0']).toEqual(['paste-1'])
    expect(blockText(editor.getState().document.blocks['paste-0'])).toBe('Parent')
    expect(blockText(editor.getState().document.blocks['paste-1'])).toBe('Child')

    const undoResult = editor.undo()

    expect(undoResult.ok).toBe(true)
    expect(editor.getState().document.children.root).toEqual(['anchor', 'tail'])
    expect(editor.getState().document.blocks['paste-0']).toBeUndefined()
    expect(editor.getState().document.blocks['paste-1']).toBeUndefined()
  })

  it('preserves source order when structured clipboard paste inserts multiple blocks', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('anchor', 'Anchor'), paragraph('tail', 'Tail')],
    })
    const editor = createEditor(createEditorState(document))
    const clipboardRootId = '__clipboard-root__'
    const sourceDocument: DocumentState = {
      id: 'clipboard-doc',
      version: 1,
      rootId: clipboardRootId,
      blocks: {
        [clipboardRootId]: { id: clipboardRootId, type: 'root' },
        'source-first': paragraph('source-first', 'First'),
        'source-second': paragraph('source-second', 'Second'),
      },
      children: {
        [clipboardRootId]: ['source-first', 'source-second'],
        'source-first': [],
        'source-second': [],
      },
    }

    const result = expectPasteOk(
      pasteClipboardPayloadIntoEditor({
        editor,
        target: { referenceBlockId: 'anchor' },
        payload: stringifyDocument(sourceDocument),
        idFactory: ({ index }) => `copy-${String(index)}`,
      }),
    )

    expect(result.insertedBlockIds).toEqual(['copy-0', 'copy-1'])
    expect(result.transactions).toHaveLength(1)
    expect(editor.getState().document.children.root).toEqual(['anchor', 'copy-0', 'copy-1', 'tail'])
    expect(blockText(editor.getState().document.blocks['copy-0'])).toBe('First')
    expect(blockText(editor.getState().document.blocks['copy-1'])).toBe('Second')
  })
})
