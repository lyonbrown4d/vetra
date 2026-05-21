import { describe, expect, it } from 'vitest'
import type { InlineContent } from '@vetra/core'
import {
  createMergeBlockBackwardIntent,
  createSplitBlockIntent,
  dispatchLexicalBlockStructuralIntent,
  isStartLikeBoundary,
  splitInlineContentAtTextOffset,
  type LexicalInlineContentBoundary,
} from '@vetra/lexical/commandBridge/structuralIntents'
import { canRunStructuralKeyCommand, isStructuralKey } from '@vetra/lexical/composition'

describe('lexical command bridge helpers', () => {
  it('guards structural keys while IME composition is active', () => {
    expect(isStructuralKey('Enter')).toBe(true)
    expect(isStructuralKey('Backspace')).toBe(true)
    expect(isStructuralKey('a')).toBe(false)
    expect(canRunStructuralKeyCommand({ isComposing: true })).toBe(false)
    expect(canRunStructuralKeyCommand({ isComposing: false })).toBe(true)
  })

  it('creates split block intents from collapsed InlineContent text offsets', () => {
    const intent = createSplitBlockIntent(
      boundary({
        textOffset: 7,
        content: {
          type: 'inline-content',
          version: 1,
          children: [
            { type: 'text', text: 'Hello ', marks: ['bold'] },
            { type: 'text', text: 'world', marks: ['italic'] },
          ],
        },
      }),
      { isComposing: false },
    )

    expect(intent).toEqual({
      type: 'splitBlock',
      before: {
        type: 'inline-content',
        version: 1,
        children: [
          { type: 'text', text: 'Hello ', marks: ['bold'] },
          { type: 'text', text: 'w', marks: ['italic'] },
        ],
      },
      after: {
        type: 'inline-content',
        version: 1,
        children: [{ type: 'text', text: 'orld', marks: ['italic'] }],
      },
    })
  })

  it('does not create structural intents while composing or with expanded selection', () => {
    const collapsedBoundary = boundary({ textOffset: 0 })
    const expandedBoundary = boundary({ isCollapsed: false, textOffset: 0 })

    expect(createSplitBlockIntent(collapsedBoundary, { isComposing: true })).toBeUndefined()
    expect(createSplitBlockIntent(expandedBoundary, { isComposing: false })).toBeUndefined()
    expect(createMergeBlockBackwardIntent(collapsedBoundary, { isComposing: true })).toBeUndefined()
  })

  it('creates merge backward intents only at a collapsed start-like boundary', () => {
    const content = inlineText('Merge me')

    expect(
      createMergeBlockBackwardIntent(boundary({ content, textOffset: 0 }), {
        isComposing: false,
      }),
    ).toEqual({
      type: 'mergeBlockBackward',
      content,
    })
    expect(isStartLikeBoundary(boundary({ content, textOffset: 1 }))).toBe(false)
    expect(
      createMergeBlockBackwardIntent(boundary({ content, textOffset: 1 }), {
        isComposing: false,
      }),
    ).toBeUndefined()
  })

  it('splits links and inline code without introducing Lexical-specific fields', () => {
    const split = splitInlineContentAtTextOffset(
      {
        type: 'inline-content',
        version: 1,
        children: [
          {
            type: 'link',
            href: 'https://example.com',
            children: [{ type: 'text', text: 'Docs' }],
          },
          { type: 'inline-code', text: 'npm test' },
        ],
      },
      6,
    )

    expect(split).toEqual({
      before: {
        type: 'inline-content',
        version: 1,
        children: [
          {
            type: 'link',
            href: 'https://example.com',
            children: [{ type: 'text', text: 'Docs' }],
          },
          { type: 'inline-code', text: 'np' },
        ],
      },
      after: {
        type: 'inline-content',
        version: 1,
        children: [{ type: 'inline-code', text: 'm test' }],
      },
    })
    expect(JSON.stringify(split).toLowerCase()).not.toContain('lexical')
  })

  it('reports whether structural intents were handled by the bridge callbacks', () => {
    const splitIntent = {
      type: 'splitBlock',
      before: inlineText('A'),
      after: inlineText('B'),
    } as const
    const mergeIntent = {
      type: 'mergeBlockBackward',
      content: inlineText('B'),
    } as const
    const handledTypes: string[] = []

    expect(
      dispatchLexicalBlockStructuralIntent(splitIntent, {
        onMergeBlockBackward: undefined,
        onSplitBlock(intent) {
          handledTypes.push(intent.type)
        },
        onStructuralIntent: undefined,
      }),
    ).toBe(true)
    expect(
      dispatchLexicalBlockStructuralIntent(mergeIntent, {
        onMergeBlockBackward() {
          return false
        },
        onSplitBlock: undefined,
        onStructuralIntent: undefined,
      }),
    ).toBe(false)
    expect(
      dispatchLexicalBlockStructuralIntent(splitIntent, {
        onMergeBlockBackward: undefined,
        onSplitBlock: undefined,
        onStructuralIntent() {
          handledTypes.push('generic')
        },
      }),
    ).toBe(true)
    expect(handledTypes).toEqual(['splitBlock', 'generic'])
  })
})

function boundary(
  overrides: Partial<LexicalInlineContentBoundary> = {},
): LexicalInlineContentBoundary {
  return {
    content: inlineText('Hello'),
    isCollapsed: true,
    textOffset: 0,
    ...overrides,
  }
}

function inlineText(text: string): InlineContent {
  return {
    type: 'inline-content',
    version: 1,
    children: text.length === 0 ? [] : [{ type: 'text', text }],
  }
}
