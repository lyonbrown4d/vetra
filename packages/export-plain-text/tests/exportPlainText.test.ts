import { describe, expect, it } from 'vitest'
import { createDocument, createTextInlineContent } from '@vetra/core'
import type { DocBlock, DocumentState, InlineContent } from '@vetra/core'
import { documentToPlainText, inlineContentToPlainText } from '@vetra/export-plain-text'

describe('@vetra/export-plain-text', () => {
  it('exports basic blocks into reasonable plain text', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [
        richTextBlock('heading-1', 'heading', 'Title', { level: 1 }),
        richTextBlock('paragraph-1', 'paragraph', 'Intro'),
        richTextBlock('quote-1', 'quote', 'Quoted text'),
        { id: 'code-1', type: 'code', content: 'const value = 1' },
        { id: 'divider-1', type: 'divider' },
        { id: 'image-1', type: 'image', props: { alt: 'Architecture diagram' } },
      ],
    })

    expect(documentToPlainText(document)).toBe(
      ['Title', 'Intro', 'Quoted text', 'const value = 1', '---', 'Architecture diagram'].join(
        '\n\n',
      ),
    )
  })

  it('exports inline content without leaking formatting syntax', () => {
    const inlineContent: InlineContent = {
      type: 'inline-content',
      version: 1,
      children: [
        { type: 'text', text: 'Hello ', marks: ['bold'] },
        { type: 'link', href: 'https://example.com', children: [{ type: 'text', text: 'link' }] },
        { type: 'text', text: ' ' },
        { type: 'mention', id: 'user-1', label: 'Ada' },
        { type: 'text', text: ' ' },
        { type: 'inline-code', text: 'code()' },
      ],
    }

    expect(inlineContentToPlainText(inlineContent)).toBe('Hello link Ada code()')
  })

  it('degrades unknown blocks to text content or a marker', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [
        { id: 'custom-1', type: 'custom-card', content: createTextInlineContent('Custom text') },
        { id: 'custom-2', type: 'custom-empty' },
      ],
    })

    expect(documentToPlainText(document)).toBe(
      ['Custom text', '[unsupported block: custom-empty]'].join('\n\n'),
    )
  })

  it('allows product-specific separators and unknown block fallback', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [{ id: 'custom-1', type: 'custom-widget' }],
    })

    expect(
      documentToPlainText(document, {
        blockSeparator: '\n',
        unknownBlockFallback: ({ block }) => `[${block.type}]`,
      }),
    ).toBe('[custom-widget]')
  })

  it('exports nested block children after their parent', () => {
    const baseDocument = createDocument({
      id: 'doc',
      blocks: [
        richTextBlock('parent', 'paragraph', 'Parent'),
        richTextBlock('child', 'paragraph', 'Child'),
      ],
    })
    const document: DocumentState = {
      ...baseDocument,
      children: {
        ...baseDocument.children,
        [baseDocument.rootId]: ['parent'],
        parent: ['child'],
        child: [],
      },
    }

    expect(documentToPlainText(document, { blockSeparator: '\n' })).toBe('Parent\nChild')
  })
})

function richTextBlock(
  id: string,
  type: 'heading' | 'paragraph' | 'quote',
  text: string,
  props?: Readonly<Record<string, unknown>>,
): DocBlock {
  return {
    id,
    type,
    content: createTextInlineContent(text),
    ...(props === undefined ? {} : { props }),
  }
}
