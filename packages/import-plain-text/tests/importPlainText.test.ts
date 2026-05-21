import { describe, expect, it } from 'vitest'
import type { InlineContent } from '@vetra/core'
import { plainTextToDocument, splitPlainText } from '@vetra/import-plain-text'

function blockText(content: unknown): string {
  const inlineContent = content as InlineContent
  const firstChild = inlineContent.children[0]

  return firstChild?.type === 'text' ? firstChild.text : ''
}

describe('@vetra/import-plain-text', () => {
  it('imports paragraph-split plain text into paragraph blocks with caller metadata', () => {
    const document = plainTextToDocument('First paragraph\nwrapped\n\nSecond paragraph', {
      documentId: 'doc-1',
      rootId: 'root-1',
      meta: { title: 'Imported plain text' },
      idFactory: ({ index }) => `p-${String(index + 1)}`,
    })

    expect(document.id).toBe('doc-1')
    expect(document.rootId).toBe('root-1')
    expect(document.meta?.title).toBe('Imported plain text')
    expect(document.children['root-1']).toEqual(['p-1', 'p-2'])
    expect(document.blocks['p-1']?.type).toBe('paragraph')
    expect(blockText(document.blocks['p-1']?.content)).toBe('First paragraph\nwrapped')
    expect(blockText(document.blocks['p-2']?.content)).toBe('Second paragraph')
  })

  it('imports line-split plain text and preserves empty lines as empty paragraphs', () => {
    const document = plainTextToDocument('Alpha\r\n\r\nBeta', {
      splitBy: 'line',
      idFactory: ({ index }) => `line-${String(index)}`,
    })

    expect(document.children.root).toEqual(['line-0', 'line-1', 'line-2'])
    expect(blockText(document.blocks['line-0']?.content)).toBe('Alpha')
    expect(blockText(document.blocks['line-1']?.content)).toBe('')
    expect(blockText(document.blocks['line-2']?.content)).toBe('Beta')
  })

  it('creates one empty paragraph for empty plain text', () => {
    const document = plainTextToDocument('', {
      idFactory: ({ index }) => `empty-${String(index)}`,
    })

    expect(document.children.root).toEqual(['empty-0'])
    expect(blockText(document.blocks['empty-0']?.content)).toBe('')
  })

  it('exposes paragraph splitting as adapter-owned strategy', () => {
    expect(splitPlainText('\n\nAlpha\nBeta\n\n\nGamma\n')).toEqual(['Alpha\nBeta', 'Gamma'])
  })

  it('rejects duplicate ids from a custom id factory', () => {
    expect(() =>
      plainTextToDocument('Alpha\nBeta', {
        splitBy: 'line',
        idFactory: () => 'duplicate',
      }),
    ).toThrow('duplicate block id')
  })

  it('rejects imported block ids that conflict with the root id', () => {
    expect(() =>
      plainTextToDocument('Alpha', {
        rootId: 'doc-root',
        idFactory: () => 'doc-root',
      }),
    ).toThrow('conflicts with root')
  })
})
