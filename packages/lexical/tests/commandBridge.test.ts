import { describe, expect, it } from 'vitest'
import type { InlineContent } from '@vetra/core'
import {
  createMarkdownShortcutIntent,
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

  it('creates markdown shortcut conversion intents and strips syntax prefixes', () => {
    expect(
      createMarkdownShortcutIntent(boundary({ content: inlineText('# Heading'), textOffset: 2 }), {
        isComposing: false,
      }),
    ).toEqual({
      type: 'convertBlockType',
      blockType: 'heading',
      props: { level: 1 },
      content: inlineText('Heading'),
    })
    expect(
      createMarkdownShortcutIntent(boundary({ content: inlineText('## Heading'), textOffset: 3 }), {
        isComposing: false,
      }),
    ).toMatchObject({ blockType: 'heading', props: { level: 2 }, content: inlineText('Heading') })
    expect(
      createMarkdownShortcutIntent(
        boundary({ content: inlineText('### Heading'), textOffset: 4 }),
        {
          isComposing: false,
        },
      ),
    ).toMatchObject({ blockType: 'heading', props: { level: 3 }, content: inlineText('Heading') })
    expect(
      createMarkdownShortcutIntent(boundary({ content: inlineText('> Quote'), textOffset: 2 }), {
        isComposing: false,
      }),
    ).toEqual({
      type: 'convertBlockType',
      blockType: 'quote',
      props: undefined,
      content: inlineText('Quote'),
    })
    expect(
      createMarkdownShortcutIntent(boundary({ content: inlineText('``` code'), textOffset: 4 }), {
        isComposing: false,
      }),
    ).toEqual({
      type: 'convertBlockType',
      blockType: 'code',
      props: undefined,
      content: 'code',
    })
    expect(
      createMarkdownShortcutIntent(boundary({ content: inlineText('---'), textOffset: 3 }), {
        isComposing: false,
      }),
    ).toBeUndefined()
  })

  it('does not create markdown shortcut intents for ordinary input or composition', () => {
    const headingBoundary = boundary({ content: inlineText('# Heading'), textOffset: 2 })

    expect(
      createMarkdownShortcutIntent(boundary({ content: inlineText('#Heading'), textOffset: 8 }), {
        isComposing: false,
      }),
    ).toBeUndefined()
    expect(
      createMarkdownShortcutIntent(boundary({ content: inlineText('# Heading'), textOffset: 9 }), {
        isComposing: false,
      }),
    ).toBeUndefined()
    expect(createMarkdownShortcutIntent(headingBoundary, { isComposing: true })).toBeUndefined()
    expect(
      createMarkdownShortcutIntent(
        boundary({ content: inlineText('# Heading'), isCollapsed: false, textOffset: 2 }),
        { isComposing: false },
      ),
    ).toBeUndefined()
  })

  it('creates a code conversion intent for triple backticks followed by Enter', () => {
    expect(
      createMarkdownShortcutIntent(
        boundary({ content: inlineText('```'), textOffset: 3 }),
        { isComposing: false },
        'enter',
      ),
    ).toEqual({
      type: 'convertBlockType',
      blockType: 'code',
      props: undefined,
      content: '',
    })
    expect(
      createMarkdownShortcutIntent(boundary({ content: inlineText('```'), textOffset: 3 }), {
        isComposing: false,
      }),
    ).toBeUndefined()
  })

  it('creates a divider conversion intent for triple dashes followed by Enter', () => {
    expect(
      createMarkdownShortcutIntent(
        boundary({ content: inlineText('---'), textOffset: 3 }),
        { isComposing: false },
        'enter',
      ),
    ).toEqual({
      type: 'convertBlockType',
      blockType: 'divider',
      props: undefined,
      content: undefined,
    })
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
    const convertIntent = {
      type: 'convertBlockType',
      blockType: 'heading',
      props: { level: 1 },
      content: inlineText('Title'),
    } as const
    const handledTypes: string[] = []

    expect(
      dispatchLexicalBlockStructuralIntent(splitIntent, {
        onMergeBlockBackward: undefined,
        onSplitBlock(intent) {
          handledTypes.push(intent.type)
        },
        onConvertBlockType: undefined,
        onStructuralIntent: undefined,
      }),
    ).toBe(true)
    expect(
      dispatchLexicalBlockStructuralIntent(mergeIntent, {
        onMergeBlockBackward() {
          return false
        },
        onSplitBlock: undefined,
        onConvertBlockType: undefined,
        onStructuralIntent: undefined,
      }),
    ).toBe(false)
    expect(
      dispatchLexicalBlockStructuralIntent(convertIntent, {
        onMergeBlockBackward: undefined,
        onSplitBlock: undefined,
        onConvertBlockType(intent) {
          handledTypes.push(`${intent.type}:${intent.blockType}`)
        },
        onStructuralIntent: undefined,
      }),
    ).toBe(true)
    expect(
      dispatchLexicalBlockStructuralIntent(splitIntent, {
        onMergeBlockBackward: undefined,
        onSplitBlock: undefined,
        onConvertBlockType: undefined,
        onStructuralIntent() {
          handledTypes.push('generic')
        },
      }),
    ).toBe(true)
    expect(handledTypes).toEqual(['splitBlock', 'convertBlockType:heading', 'generic'])
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
