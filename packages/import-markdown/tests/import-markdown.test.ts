import { describe, expect, it } from 'vitest'
import { validateDocument, type DocumentState, type InlineContent } from '@vetra/core'
import { markdownToDocument } from '../src'

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

describe('@vetra/import-markdown', () => {
  it('imports supported Markdown blocks into a valid Vetra document', () => {
    const markdown = [
      '# Title',
      '',
      'Intro paragraph',
      'with a soft break.',
      '',
      '> Quoted',
      '> text',
      '',
      '---',
      '',
      '```ts',
      'const answer = 42',
      '```',
    ].join('\n')

    const document = markdownToDocument(markdown, { documentId: 'doc' })
    const validation = validateDocument(document)

    expect(validation.ok).toBe(true)
    expect(document.children.root).toEqual(['md-1', 'md-2', 'md-3', 'md-4', 'md-5'])
    expect(block(document, 'md-1')).toMatchObject({ type: 'heading', props: { level: 1 } })
    expect(inlineText(block(document, 'md-1')?.content)).toBe('Title')
    expect(block(document, 'md-2')?.type).toBe('paragraph')
    expect(inlineText(block(document, 'md-2')?.content)).toBe('Intro paragraph\nwith a soft break.')
    expect(block(document, 'md-3')?.type).toBe('quote')
    expect(inlineText(block(document, 'md-3')?.content)).toBe('Quoted\ntext')
    expect(block(document, 'md-4')?.type).toBe('divider')
    expect(block(document, 'md-5')).toMatchObject({
      type: 'code',
      props: { language: 'ts' },
      content: 'const answer = 42',
    })
  })

  it('keeps complex Markdown as paragraph plain text by adapter strategy', () => {
    const document = markdownToDocument(['- one', '- two', '', '| a | b |'].join('\n'))

    expect(document.children.root).toEqual(['md-1', 'md-2'])
    expect(block(document, 'md-1')?.type).toBe('paragraph')
    expect(inlineText(block(document, 'md-1')?.content)).toBe('- one\n- two')
    expect(block(document, 'md-2')?.type).toBe('paragraph')
    expect(inlineText(block(document, 'md-2')?.content)).toBe('| a | b |')
  })

  it('allows callers to provide document and block identity strategy', () => {
    const document = markdownToDocument('## Custom', {
      documentId: 'custom-doc',
      rootId: 'custom-root',
      generateBlockId: ({ blockType, ordinal, sourceLine }) =>
        `${blockType}-${String(ordinal)}-line-${String(sourceLine)}`,
    })

    expect(document.id).toBe('custom-doc')
    expect(document.rootId).toBe('custom-root')
    expect(document.children['custom-root']).toEqual(['heading-1-line-1'])
  })

  it('rejects block identity strategies that produce duplicate or root ids', () => {
    expect(() =>
      markdownToDocument(['# First', 'Second'].join('\n\n'), {
        generateBlockId: () => 'duplicate',
      }),
    ).toThrow('duplicate block id')

    expect(() =>
      markdownToDocument('# Root conflict', {
        rootId: 'doc-root',
        generateBlockId: () => 'doc-root',
      }),
    ).toThrow('conflicts with root')
  })
})
