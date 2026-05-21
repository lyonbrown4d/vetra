import { describe, expect, it } from 'vitest'
import type { InlineContent } from '@vetra/core'
import {
  createLexicalAdapterState,
  createLexicalAdapterTextNode,
  inlineContentToLexicalAdapterState,
  lexicalAdapterStateToInlineContent,
} from '@vetra/lexical/serializers/richText'

describe('lexical rich text serializer', () => {
  it('roundtrips text and preserves inline marks as Lexical text format flags', () => {
    const content: InlineContent = {
      type: 'inline-content',
      version: 1,
      children: [
        { type: 'text', text: 'Bold italic ', marks: ['bold', 'italic'] },
        { type: 'text', text: 'plain' },
      ],
    }

    const state = inlineContentToLexicalAdapterState(content)
    const paragraph = getOnlyParagraph(state)

    expect(paragraph.children).toMatchObject([
      { type: 'text', text: 'Bold italic ', format: 3 },
      { type: 'text', text: 'plain', format: 0 },
    ])
    expect(lexicalAdapterStateToInlineContent(state)).toEqual(content)
  })

  it('flattens links to text fallback while preserving child text marks', () => {
    const content: InlineContent = {
      type: 'inline-content',
      version: 1,
      children: [
        {
          type: 'link',
          href: 'https://example.com',
          children: [{ type: 'text', text: 'Example', marks: ['underline'] }],
        },
      ],
    }

    expect(roundtrip(content)).toEqual({
      type: 'inline-content',
      version: 1,
      children: [{ type: 'text', text: 'Example', marks: ['underline'] }],
    })
  })

  it('uses mention labels as text fallback', () => {
    const content: InlineContent = {
      type: 'inline-content',
      version: 1,
      children: [{ type: 'mention', id: 'user-1', label: '@Ada' }],
    }

    expect(roundtrip(content)).toEqual({
      type: 'inline-content',
      version: 1,
      children: [{ type: 'text', text: '@Ada' }],
    })
  })

  it('uses the Lexical code text format as inline-code fallback', () => {
    const content: InlineContent = {
      type: 'inline-content',
      version: 1,
      children: [{ type: 'inline-code', text: 'const answer = 42' }],
    }

    const state = inlineContentToLexicalAdapterState(content)
    const paragraph = getOnlyParagraph(state)

    expect(paragraph.children).toMatchObject([{ text: 'const answer = 42', format: 16 }])
    expect(lexicalAdapterStateToInlineContent(state)).toEqual({
      type: 'inline-content',
      version: 1,
      children: [{ type: 'text', text: 'const answer = 42', marks: ['code'] }],
    })
  })

  it('deserializes adapter text nodes into Vetra InlineContent without Lexical types', () => {
    const content = lexicalAdapterStateToInlineContent(
      createLexicalAdapterState([
        createLexicalAdapterTextNode('Styled', 1 | 8 | 4),
        createLexicalAdapterTextNode(' code', 16),
      ]),
    )

    expect(content).toEqual({
      type: 'inline-content',
      version: 1,
      children: [
        { type: 'text', text: 'Styled', marks: ['bold', 'underline', 'strike'] },
        { type: 'text', text: ' code', marks: ['code'] },
      ],
    })
    expect(JSON.stringify(content).toLowerCase()).not.toContain('lexical')
  })
})

function roundtrip(content: InlineContent): InlineContent {
  return lexicalAdapterStateToInlineContent(inlineContentToLexicalAdapterState(content))
}

function getOnlyParagraph(state: ReturnType<typeof inlineContentToLexicalAdapterState>) {
  const paragraph = state.root.children.at(0)

  if (paragraph === undefined) {
    throw new Error('Expected adapter state to contain one paragraph')
  }

  return paragraph
}
