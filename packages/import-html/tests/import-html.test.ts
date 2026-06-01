// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { validateDocument, type DocumentState, type InlineContent } from '@vetra/core'
import { htmlToDocument } from '@vetra/import-html'

function inlineText(content: unknown): string {
  const inlineContent = content as InlineContent
  return inlineContent.children
    .map((node) => {
      if (node.type === 'text' || node.type === 'inline-code') {
        return node.text
      }

      if (node.type === 'mention') {
        return node.label
      }

      return node.children.map((child) => (child.type === 'text' ? child.text : '')).join('')
    })
    .join('')
}

function block(document: DocumentState, id: string) {
  return document.blocks[id]
}

describe('@vetra/import-html', () => {
  it('imports supported HTML blocks into a valid Vetra document', () => {
    const html = [
      '<h1>Title</h1>',
      '<p>Intro <a href="https://example.com">link</a></p>',
      '<blockquote><p>Quoted</p><p>text</p></blockquote>',
      '<hr>',
      '<pre><code class="language-ts">const answer = 42</code></pre>',
      '<code class="language-js">console.log(1)</code>',
    ].join('')

    const document = htmlToDocument(html, {
      documentId: 'doc',
      meta: { title: 'Imported HTML' },
      generateBlockId: ({ blockType, ordinal, sourceTag }) =>
        `${sourceTag}-${blockType}-${String(ordinal)}`,
    })
    const validation = validateDocument(document)

    expect(validation.ok).toBe(true)
    expect(document.id).toBe('doc')
    expect(document.meta?.title).toBe('Imported HTML')
    expect(document.children.root).toEqual([
      'h1-heading-1',
      'p-paragraph-2',
      'blockquote-quote-3',
      'hr-divider-4',
      'pre-code-5',
      'code-code-6',
    ])
    expect(block(document, 'h1-heading-1')).toMatchObject({
      type: 'heading',
      props: { level: 1 },
    })
    expect(inlineText(block(document, 'h1-heading-1')?.content)).toBe('Title')
    expect(block(document, 'p-paragraph-2')?.type).toBe('paragraph')
    expect(inlineText(block(document, 'p-paragraph-2')?.content)).toBe('Intro link')
    expect(block(document, 'blockquote-quote-3')?.type).toBe('quote')
    expect(inlineText(block(document, 'blockquote-quote-3')?.content)).toBe('Quoted\ntext')
    expect(block(document, 'hr-divider-4')?.type).toBe('divider')
    expect(block(document, 'pre-code-5')).toMatchObject({
      type: 'code',
      props: { language: 'ts' },
      content: 'const answer = 42',
    })
    expect(block(document, 'code-code-6')).toMatchObject({
      type: 'code',
      props: { language: 'js' },
      content: 'console.log(1)',
    })
  })

  it('recursively imports containers and ordinary text as paragraphs', () => {
    const document = htmlToDocument(
      [
        'Lead <strong>text</strong>',
        '<section><h2>Nested title</h2><custom-element>Nested body</custom-element></section>',
      ].join(''),
    )

    expect(document.children.root).toEqual(['html-1', 'html-2', 'html-3'])
    expect(block(document, 'html-1')?.type).toBe('paragraph')
    expect(inlineText(block(document, 'html-1')?.content)).toBe('Lead text')
    expect(block(document, 'html-2')).toMatchObject({ type: 'heading', props: { level: 2 } })
    expect(inlineText(block(document, 'html-2')?.content)).toBe('Nested title')
    expect(block(document, 'html-3')?.type).toBe('paragraph')
    expect(inlineText(block(document, 'html-3')?.content)).toBe('Nested body')
  })

  it('keeps inline code inside ordinary containers without splitting paragraph flow', () => {
    const document = htmlToDocument(
      '<div>Use <code>const value = 1</code> now</div><code class="language-js">console.log(1)</code>',
    )

    expect(document.children.root).toEqual(['html-1', 'html-2'])
    expect(block(document, 'html-1')?.type).toBe('paragraph')
    expect(inlineText(block(document, 'html-1')?.content)).toBe('Use const value = 1 now')
    expect(block(document, 'html-2')).toMatchObject({
      type: 'code',
      props: { language: 'js' },
      content: 'console.log(1)',
    })
  })

  it('keeps whitespace-wrapped standalone code as a code block', () => {
    const document = htmlToDocument(
      ['<div>', '  <code class="language-ts">const answer = 42</code>', '</div>'].join('\n'),
    )

    expect(document.children.root).toEqual(['html-1'])
    expect(block(document, 'html-1')).toMatchObject({
      type: 'code',
      props: { language: 'ts' },
      content: 'const answer = 42',
    })
  })

  it('sanitizes imported code language classes and skips empty sanitized tokens', () => {
    const document = htmlToDocument(
      [
        '<pre><code class="language-ts<script>">const value = 1</code></pre>',
        '<pre><code class="language-<> language-js">console.log(1)</code></pre>',
      ].join(''),
    )

    expect(block(document, 'html-1')).toMatchObject({
      type: 'code',
      props: { language: 'tsscript' },
      content: 'const value = 1',
    })
    expect(block(document, 'html-2')).toMatchObject({
      type: 'code',
      props: { language: 'js' },
      content: 'console.log(1)',
    })
  })

  it('keeps inline code wrapped by inline elements in paragraph flow', () => {
    const document = htmlToDocument('<span><code>inline()</code></span> text')

    expect(document.children.root).toEqual(['html-1'])
    expect(block(document, 'html-1')?.type).toBe('paragraph')
    expect(inlineText(block(document, 'html-1')?.content)).toBe('inline() text')
  })

  it('ignores dangerous HTML content instead of importing it as document text', () => {
    const document = htmlToDocument(
      [
        '<p>Safe</p>',
        '<script><p>Unsafe script</p></script>',
        '<style>.unsafe::before { content: "style"; }</style>',
        '<template><p>Unsafe template</p></template>',
        '<noscript>Unsafe noscript</noscript>',
      ].join(''),
    )

    expect(document.children.root).toEqual(['html-1'])
    expect(inlineText(block(document, 'html-1')?.content)).toBe('Safe')
  })

  it('applies caller document identity and rejects invalid generated block ids', () => {
    const document = htmlToDocument('<p>Alpha</p>', {
      documentId: 'custom-doc',
      rootId: 'custom-root',
      generateBlockId: ({ blockType }) => `${blockType}-1`,
    })

    expect(document.id).toBe('custom-doc')
    expect(document.rootId).toBe('custom-root')
    expect(document.children['custom-root']).toEqual(['paragraph-1'])

    expect(() =>
      htmlToDocument('<p>Alpha</p><p>Beta</p>', {
        generateBlockId: () => 'duplicate',
      }),
    ).toThrow('duplicate block id')

    expect(() =>
      htmlToDocument('<p>Alpha</p>', {
        rootId: 'doc-root',
        generateBlockId: () => 'doc-root',
      }),
    ).toThrow('conflicts with root')
  })
})
