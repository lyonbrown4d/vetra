import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createTextInlineContent,
  type DividerBlock,
  type DocBlock,
  type HeadingBlock,
  type ParagraphBlock,
  type QuoteBlock,
} from '@vetra/core'
import { documentToMarkdown } from '@vetra/export-markdown'

interface CodeBlock extends DocBlock {
  readonly type: 'code'
  readonly props?: {
    readonly language?: string
  }
  readonly content: string
}

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function heading(id: string, level: HeadingBlock['props']['level'], text: string): HeadingBlock {
  return {
    id,
    type: 'heading',
    props: { level },
    content: createTextInlineContent(text),
  }
}

function quote(id: string, text: string): QuoteBlock {
  return {
    id,
    type: 'quote',
    content: createTextInlineContent(text),
  }
}

function divider(id: string): DividerBlock {
  return {
    id,
    type: 'divider',
  }
}

function code(id: string, content: string, language?: string): CodeBlock {
  return {
    id,
    type: 'code',
    ...(language === undefined ? {} : { props: { language } }),
    content,
  }
}

describe('@vetra/export-markdown', () => {
  it('exports supported basic blocks to Markdown', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [
        heading('a', 2, 'Section'),
        paragraph('b', 'First paragraph'),
        quote('c', 'Quoted\ntext'),
        divider('d'),
        code('e', 'const answer = 42', 'ts'),
      ],
    })

    expect(documentToMarkdown(document)).toBe(
      [
        '## Section',
        '',
        'First paragraph',
        '',
        '> Quoted',
        '> text',
        '',
        '---',
        '',
        '```ts',
        'const answer = 42',
        '```',
      ].join('\n'),
    )
  })

  it('uses a longer code fence when code content contains backticks', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [code('code', '```nested```')],
    })

    expect(documentToMarkdown(document)).toBe(['````', '```nested```', '````'].join('\n'))
  })

  it('falls back for unknown blocks without throwing', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [
        {
          id: 'custom-text',
          type: 'custom',
          content: createTextInlineContent('Text fallback'),
        },
        {
          id: 'custom-widget',
          type: 'widget',
          props: { opaque: true },
        },
      ],
    })

    expect(documentToMarkdown(document)).toBe(
      ['Text fallback', '', '<!-- Unsupported Vetra block: widget (custom-widget) -->'].join('\n'),
    )
  })

  it('can omit unknown block comments when requested', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [{ id: 'custom-widget', type: 'widget' }],
    })

    expect(documentToMarkdown(document, { includeUnknownBlockComments: false })).toBe('')
  })
})
