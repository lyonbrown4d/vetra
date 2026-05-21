import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createEditor,
  createEditorState,
  createTextInlineContent,
  type DocBlock,
  type HeadingBlock,
  type InlineContent,
  type ParagraphBlock,
  type Result,
} from '@vetra/core'
import {
  createDocumentPasteStrategy,
  createPasteHandler,
  markdownPasteKind,
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
})
