import { describe, expect, it } from 'vitest'
import { createDocument, createTextInlineContent } from '@vetra/core'
import type {
  DividerBlock,
  DocBlock,
  DocumentState,
  HeadingBlock,
  InlineContent,
  ParagraphBlock,
  QuoteBlock,
} from '@vetra/core'
import { documentToHtml } from '@vetra/export-html'

interface CodeBlock extends DocBlock {
  readonly type: 'code'
  readonly props?: {
    readonly language?: string
  }
  readonly content: string
}

describe('@vetra/export-html', () => {
  it('escapes block text instead of treating content as raw HTML', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('p', 'Hello <script>alert("x")</script> & friends')],
    })

    expect(documentToHtml(document)).toBe(
      '<p>Hello &lt;script&gt;alert("x")&lt;/script&gt; &amp; friends</p>',
    )
  })

  it('exports heading, quote, code, and divider blocks', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [
        heading('h', 2, 'Section'),
        quote('q', 'Quoted <text>'),
        code('c', 'const value = <tag>', 'ts'),
        divider('d'),
      ],
    })

    expect(documentToHtml(document)).toBe(
      [
        '<h2>Section</h2>',
        '<blockquote>Quoted &lt;text&gt;</blockquote>',
        '<pre><code class="language-ts">const value = &lt;tag&gt;</code></pre>',
        '<hr>',
      ].join('\n'),
    )
  })

  it('exports inline marks, links, mentions, and inline code safely', () => {
    const content: InlineContent = {
      type: 'inline-content',
      version: 1,
      children: [
        { type: 'text', text: 'Both', marks: ['bold', 'italic'] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'under', marks: ['underline'] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'gone', marks: ['strike'] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'marked()', marks: ['code'] },
        { type: 'text', text: ' ' },
        {
          type: 'link',
          href: 'https://example.com?a=1&b=<x>',
          children: [{ type: 'text', text: 'link & label' }],
        },
        { type: 'text', text: ' ' },
        {
          type: 'link',
          href: 'javascript:alert(1)',
          children: [{ type: 'text', text: 'unsafe' }],
        },
        { type: 'text', text: ' ' },
        { type: 'mention', id: 'user-1', label: 'Ada <L>' },
        { type: 'text', text: ' ' },
        { type: 'inline-code', text: 'x < y' },
      ],
    }
    const document = createDocument({
      id: 'doc',
      blocks: [{ id: 'p', type: 'paragraph', content }],
    })

    expect(documentToHtml(document)).toBe(
      [
        '<p>',
        '<strong><em>Both</em></strong> ',
        '<u>under</u> ',
        '<s>gone</s> ',
        '<code>marked()</code> ',
        '<a href="https://example.com?a=1&amp;b=&lt;x&gt;">link &amp; label</a> ',
        'unsafe ',
        'Ada &lt;L&gt; ',
        '<code>x &lt; y</code>',
        '</p>',
      ].join(''),
    )
  })

  it('falls back for unknown blocks without throwing', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [
        {
          id: 'custom-text',
          type: 'custom-card',
          content: createTextInlineContent('Custom <text>'),
        },
        {
          id: 'custom-empty',
          type: 'widget',
        },
      ],
    })

    expect(documentToHtml(document)).toBe(
      [
        '<p data-vetra-unsupported-block="custom-card">Custom &lt;text&gt;</p>',
        '<!-- Unsupported Vetra block: widget (custom-empty) -->',
      ].join('\n'),
    )
  })

  it('can omit comments for unknown empty blocks', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [{ id: 'custom-empty', type: 'widget' }],
    })

    expect(documentToHtml(document, { includeUnknownBlockComments: false })).toBe('')
  })

  it('exports document tree order without emitting the root block', () => {
    const baseDocument = createDocument({
      id: 'doc',
      blocks: [
        paragraph('parent', 'Parent'),
        paragraph('child', 'Child'),
        paragraph('sibling', 'Sibling'),
      ],
    })
    const document: DocumentState = {
      ...baseDocument,
      children: {
        ...baseDocument.children,
        [baseDocument.rootId]: ['parent', 'sibling'],
        parent: ['child'],
        child: [],
        sibling: [],
      },
    }

    expect(documentToHtml(document)).toBe('<p>Parent</p>\n<p>Child</p>\n<p>Sibling</p>')
  })
})

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
