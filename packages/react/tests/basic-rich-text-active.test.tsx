/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDocument,
  createEditor,
  createEditorState,
  createTextInlineContent,
  type EditorRuntime,
  type InlineContent,
  type InlineNode,
  type ParagraphBlock,
} from '@vetra/core'
import { basicBlocks } from '@vetra/blocks-basic/react'
import { BlockRenderer, EditorProvider } from '@vetra/react'

interface MockLexicalBlockCommit {
  readonly type: 'commitInlineContent'
  readonly reason: 'blur' | 'unmount'
  readonly content: InlineContent
}

interface MockLexicalSplitBlockIntent {
  readonly type: 'splitBlock'
  readonly before: InlineContent
  readonly after: InlineContent
}

interface MockLexicalMergeBlockBackwardIntent {
  readonly type: 'mergeBlockBackward'
  readonly content: InlineContent
}

interface MockLexicalBlockEditorProps {
  readonly value: InlineContent
  readonly autoFocus?: boolean
  readonly onChange: (nextValue: InlineContent) => void
  readonly onCommit?: (commit: MockLexicalBlockCommit) => undefined
  readonly onMergeBlockBackward?: (
    intent: MockLexicalMergeBlockBackwardIntent,
  ) => boolean | undefined
  readonly onSplitBlock?: (intent: MockLexicalSplitBlockIntent) => boolean | undefined
}

const lexicalMock = vi.hoisted(() => ({
  props: undefined as MockLexicalBlockEditorProps | undefined,
}))

vi.mock('@vetra/lexical', () => ({
  LexicalBlockEditor(props: MockLexicalBlockEditorProps) {
    lexicalMock.props = props

    return <div data-lexical-block-editor="true" />
  },
}))

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  lexicalMock.props = undefined
})

describe('basic rich text active renderer bridge', () => {
  it('splits the active block into an after block and ignores a stale lifecycle commit', () => {
    const editor = createEditorWithParagraphs([paragraph('block-a', 'HelloWorld')], 'block-a')
    const rendered = renderBlock(editor, 'block-a')

    try {
      const activeEditor = getActiveLexicalProps()
      let handled: boolean | undefined

      act(() => {
        handled = activeEditor.onSplitBlock?.({
          type: 'splitBlock',
          before: inlineText('Hello'),
          after: inlineText('World'),
        })
        activeEditor.onCommit?.({
          type: 'commitInlineContent',
          reason: 'unmount',
          content: inlineText('HelloWorld'),
        })
      })

      const state = editor.getState()
      const rootChildren = state.document.children[state.document.rootId] ?? []
      const afterBlockId = rootChildren[1]

      expect(handled).toBe(true)
      expect(rootChildren).toHaveLength(2)
      expect(readBlockText(editor, 'block-a')).toBe('Hello')
      expect(afterBlockId).toBeDefined()
      expect(readBlockText(editor, expectDefined(afterBlockId))).toBe('World')
      expect(state.selection).toEqual({ type: 'block', blockId: afterBlockId })
    } finally {
      rendered.cleanup()
    }
  })

  it('mounts the split after block as the active auto-focused inline editor', () => {
    const editor = createEditorWithParagraphs([paragraph('block-a', 'HelloWorld')], 'block-a')
    const rendered = renderBlock(editor, 'block-a')
    let afterBlockId: string | undefined

    try {
      const activeEditor = getActiveLexicalProps()

      act(() => {
        activeEditor.onSplitBlock?.({
          type: 'splitBlock',
          before: inlineText('Hello'),
          after: inlineText('World'),
        })
      })

      afterBlockId = editor.getState().document.children.root?.[1]
      expect(afterBlockId).toBeDefined()
    } finally {
      rendered.cleanup()
    }

    const afterRendered = renderBlock(editor, expectDefined(afterBlockId))

    try {
      const afterActiveEditor = getActiveLexicalProps()

      expect(afterActiveEditor.autoFocus).toBe(true)
      expect(afterActiveEditor.value).toEqual(inlineText('World'))
    } finally {
      afterRendered.cleanup()
    }
  })

  it('merges the active block backward into the previous sibling', () => {
    const editor = createEditorWithParagraphs(
      [paragraph('block-a', 'Hello'), paragraph('block-b', 'World')],
      'block-b',
    )
    const rendered = renderBlock(editor, 'block-b')

    try {
      const activeEditor = getActiveLexicalProps()
      let handled: boolean | undefined

      act(() => {
        handled = activeEditor.onMergeBlockBackward?.({
          type: 'mergeBlockBackward',
          content: inlineText('World'),
        })
        activeEditor.onCommit?.({
          type: 'commitInlineContent',
          reason: 'unmount',
          content: inlineText('World'),
        })
      })

      const state = editor.getState()
      const rootChildren = state.document.children[state.document.rootId] ?? []

      expect(handled).toBe(true)
      expect(rootChildren).toEqual(['block-a'])
      expect(readBlockText(editor, 'block-a')).toBe('HelloWorld')
      expect(state.document.blocks['block-b']).toBeUndefined()
      expect(state.selection).toEqual({ type: 'block', blockId: 'block-a' })
    } finally {
      rendered.cleanup()
    }
  })

  it('does not suppress later commits when merge backward has no previous sibling', () => {
    const editor = createEditorWithParagraphs([paragraph('block-a', 'Draft')], 'block-a')
    const rendered = renderBlock(editor, 'block-a')

    try {
      const activeEditor = getActiveLexicalProps()
      let handled: boolean | undefined

      act(() => {
        handled = activeEditor.onMergeBlockBackward?.({
          type: 'mergeBlockBackward',
          content: inlineText('Draft'),
        })
        activeEditor.onCommit?.({
          type: 'commitInlineContent',
          reason: 'blur',
          content: inlineText('Committed'),
        })
      })

      expect(handled).toBe(false)
      expect(readBlockText(editor, 'block-a')).toBe('Committed')
    } finally {
      rendered.cleanup()
    }
  })
})

function createEditorWithParagraphs(
  blocks: readonly ParagraphBlock[],
  activeBlockId: string,
): EditorRuntime {
  const document = createDocument({
    id: 'doc',
    blocks,
  })
  const editor = createEditor(createEditorState(document))
  const selectionResult = editor.dispatch({
    type: 'setSelection',
    selection: { type: 'block', blockId: activeBlockId },
  })

  if (!selectionResult.ok) {
    throw new Error(selectionResult.error.message)
  }

  return editor
}

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function renderBlock(editor: EditorRuntime, blockId: string) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <EditorProvider blocks={basicBlocks} editor={editor}>
        <BlockRenderer blockId={blockId} />
      </EditorProvider>,
    )
  })

  return {
    cleanup() {
      unmountRoot(root)
      container.remove()
    },
  }
}

function unmountRoot(root: Root) {
  act(() => {
    root.unmount()
  })
}

function getActiveLexicalProps(): MockLexicalBlockEditorProps {
  const props = lexicalMock.props

  if (props === undefined) {
    throw new Error('Expected the mocked LexicalBlockEditor to render.')
  }

  return props
}

function inlineText(text: string): InlineContent {
  return createTextInlineContent(text)
}

function readBlockText(editor: EditorRuntime, blockId: string): string {
  const block = editor.getState().document.blocks[blockId]

  if (block === undefined || !isInlineContent(block.content)) {
    throw new Error(`Expected paragraph block "${blockId}" to exist.`)
  }

  return block.content.children.map(readInlineNodeText).join('')
}

function readInlineNodeText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
    case 'inline-code':
      return node.text
    case 'mention':
      return node.label
    case 'link':
      return node.children.map(readInlineNodeText).join('')
  }
}

function isInlineContent(value: unknown): value is InlineContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === 'inline-content' &&
    'children' in value &&
    Array.isArray(value.children)
  )
}

function expectDefined<TValue>(value: TValue | undefined): TValue {
  expect(value).toBeDefined()

  if (value === undefined) {
    throw new Error('Expected value to be defined.')
  }

  return value
}
