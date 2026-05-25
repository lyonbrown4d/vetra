/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDocument,
  createEditor,
  createEditorState,
  type DocBlock,
  type EditorRuntime,
  type InlineContent,
} from '@vetra/core'
import { createCalloutBlock, createTodoBlock } from '@vetra/blocks-basic'
import { basicBlocks } from '@vetra/blocks-basic/react'
import { BlockRenderer, EditorProvider } from '@vetra/react'

interface MockLexicalBlockEditorProps {
  readonly value: InlineContent
  readonly autoFocus?: boolean
  readonly onChange: (nextValue: InlineContent) => void
}

const lexicalMock = vi.hoisted(() => ({
  props: undefined as MockLexicalBlockEditorProps | undefined,
}))

vi.mock('@vetra/lexical', () => ({
  LexicalBlockEditor(props: MockLexicalBlockEditorProps) {
    lexicalMock.props = props

    return <div className="vetra-inline-editor" data-lexical-block-editor="true" />
  },
}))

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  lexicalMock.props = undefined
})

describe('basic blocks renderer bindings', () => {
  it('renders todo and callout blocks without changing unknown fallback behavior', () => {
    const unknownBlock: DocBlock = {
      id: 'unknown-a',
      type: 'unknown-widget',
    }
    const editor = createEditorWithBlocks([
      createTodoBlock('todo-a', 'Ship todo', true),
      createCalloutBlock('callout-a', 'Read this first', 'warning'),
      unknownBlock,
    ])

    const todoRendered = renderBlock(editor, 'todo-a')
    try {
      const todoBlock = todoRendered.container.querySelector('.vetra-block--todo')
      const checkbox = todoRendered.container.querySelector('input[type="checkbox"]')

      expect(todoRendered.container.textContent).toContain('Ship todo')
      expect(todoBlock?.getAttribute('data-checked')).toBe('true')
      expect(checkbox).toBeInstanceOf(HTMLInputElement)
      expect((checkbox as HTMLInputElement | null)?.checked).toBe(true)
    } finally {
      todoRendered.cleanup()
    }

    const calloutRendered = renderBlock(editor, 'callout-a')
    try {
      const calloutBlock = calloutRendered.container.querySelector('.vetra-block--callout')

      expect(calloutRendered.container.textContent).toContain('Read this first')
      expect(calloutBlock?.getAttribute('data-tone')).toBe('warning')
    } finally {
      calloutRendered.cleanup()
    }

    const unknownRendered = renderBlock(editor, 'unknown-a')
    try {
      expect(unknownRendered.container.textContent).toContain('Unknown block: unknown-widget')
    } finally {
      unknownRendered.cleanup()
    }
  })

  it('activates todo and callout blocks through the shared rich text lifecycle', () => {
    const editor = createEditorWithBlocks([
      createTodoBlock('todo-a', 'Editable todo'),
      createCalloutBlock('callout-a', 'Editable callout'),
    ])

    selectBlock(editor, 'todo-a')
    const todoRendered = renderBlock(editor, 'todo-a')
    try {
      const activeBlock = todoRendered.container.querySelector('.vetra-block--active')

      expect(activeBlock?.classList.contains('vetra-block--todo')).toBe(true)
      expect(getActiveLexicalProps().autoFocus).toBe(true)
      expect(getInlineText(getActiveLexicalProps().value)).toBe('Editable todo')
    } finally {
      todoRendered.cleanup()
    }

    selectBlock(editor, 'callout-a')
    const calloutRendered = renderBlock(editor, 'callout-a')
    try {
      const activeBlock = calloutRendered.container.querySelector('.vetra-block--active')

      expect(activeBlock?.classList.contains('vetra-block--callout')).toBe(true)
      expect(getActiveLexicalProps().autoFocus).toBe(true)
      expect(getInlineText(getActiveLexicalProps().value)).toBe('Editable callout')
    } finally {
      calloutRendered.cleanup()
    }
  })
})

function createEditorWithBlocks(blocks: readonly DocBlock[]): EditorRuntime {
  const document = createDocument({
    id: 'doc',
    blocks,
  })

  return createEditor(createEditorState(document))
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
    container,
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

function selectBlock(editor: EditorRuntime, blockId: string): void {
  const result = editor.dispatch({
    type: 'setSelection',
    selection: { type: 'block', blockId },
  })

  if (!result.ok) {
    throw new Error(result.error.message)
  }
}

function getActiveLexicalProps(): MockLexicalBlockEditorProps {
  const props = lexicalMock.props

  if (props === undefined) {
    throw new Error('Expected the mocked LexicalBlockEditor to render.')
  }

  return props
}

function getInlineText(content: InlineContent): string {
  return content.children
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'inline-code':
          return node.text
        case 'mention':
          return node.label
        case 'link':
          return getInlineText({
            type: 'inline-content',
            version: content.version,
            children: node.children,
          })
      }
    })
    .join('')
}
