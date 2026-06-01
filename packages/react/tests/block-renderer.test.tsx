/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createEditor,
  createEditorState,
  createTextInlineContent,
  type DocBlock,
  type EditorRuntime,
  type ParagraphBlock,
} from '@vetra/core'
import {
  BlockRenderer,
  EditorProvider,
  defineReactBlock,
  useMountedBlockCount,
  type AnyReactBlockPlugin,
  type BlockRendererProps,
} from '@vetra/react'

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function ParagraphReadonly(props: BlockRendererProps<ParagraphBlock>) {
  return <div data-renderer="readonly">readonly:{readParagraphText(props.block)}</div>
}

function ParagraphActive(props: BlockRendererProps<ParagraphBlock>) {
  return <div data-renderer="active">active:{readParagraphText(props.block)}</div>
}

const paragraphPlugin = defineReactBlock<ParagraphBlock>({
  type: 'paragraph',
  readonlyRenderer: ParagraphReadonly,
  activeRenderer: ParagraphActive,
})

function renderBlockRenderer(
  editor: EditorRuntime,
  blocks: readonly AnyReactBlockPlugin[],
  blockId: string,
  onMountedCount?: (count: number) => void,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  function MountedCountProbe() {
    const mountedBlockCount = useMountedBlockCount()
    onMountedCount?.(mountedBlockCount)

    return null
  }

  act(() => {
    root.render(
      <EditorProvider blocks={blocks} editor={editor}>
        <MountedCountProbe />
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

describe('BlockRenderer active lifecycle', () => {
  it('selects a readonly block on click and switches to the active renderer', () => {
    const editorDocument = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A')],
    })
    const editor = createEditor(createEditorState(editorDocument))
    let mountedCount = 0
    const rendered = renderBlockRenderer(editor, [paragraphPlugin], 'block-a', (count) => {
      mountedCount = count
    })

    try {
      expect(rendered.container.textContent).toContain('readonly:A')
      expect(rendered.container.textContent).not.toContain('active:A')
      expect(mountedCount).toBe(1)

      const shell = rendered.container.querySelector('[data-vetra-block-shell="block-a"]')
      if (shell === null) {
        throw new Error('Expected block shell to render.')
      }

      act(() => {
        shell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-a' })
      expect(rendered.container.textContent).toContain('active:A')
      expect(rendered.container.textContent).not.toContain('readonly:A')
      expect(mountedCount).toBe(1)
    } finally {
      rendered.cleanup()
    }
  })

  it('switches to active renderer when Enter is pressed on a readonly block shell', () => {
    const editorDocument = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A')],
    })
    const editor = createEditor(createEditorState(editorDocument))
    const rendered = renderBlockRenderer(editor, [paragraphPlugin], 'block-a')

    try {
      const shell = rendered.container.querySelector('[data-vetra-block-shell="block-a"]')
      if (shell === null) {
        throw new Error('Expected block shell to render.')
      }

      act(() => {
        shell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      })

      expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-a' })
      expect(rendered.container.textContent).toContain('active:A')
      expect(rendered.container.textContent).not.toContain('readonly:A')
    } finally {
      rendered.cleanup()
    }
  })

  it('keeps the unknown block fallback when no renderer is registered', () => {
    const unknownBlock: DocBlock = {
      id: 'unknown-a',
      type: 'unknown-widget',
    }
    const editorDocument = createDocument({
      id: 'doc',
      blocks: [unknownBlock],
    })
    const editor = createEditor(createEditorState(editorDocument))
    const rendered = renderBlockRenderer(editor, [], 'unknown-a')

    try {
      expect(rendered.container.textContent).toContain('Unknown block: unknown-widget')
    } finally {
      rendered.cleanup()
    }
  })

  it('inserts an empty paragraph after the current block from the gutter plus button', () => {
    const editorDocument = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const editor = createEditor(createEditorState(editorDocument))
    const rendered = renderBlockRenderer(editor, [paragraphPlugin], 'block-a')

    try {
      const insertButton = rendered.container.querySelector(
        '[data-vetra-block-control="insert-after"]',
      )
      if (!(insertButton instanceof HTMLButtonElement)) {
        throw new Error('Expected gutter insert button to render.')
      }

      expect(insertButton.getAttribute('aria-label')).toBe('Insert paragraph after block')

      act(() => {
        insertButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })

      const state = editor.getState()
      const rootChildren = state.document.children.root ?? []
      const insertedBlockId = rootChildren[1]

      expect(rootChildren).toHaveLength(3)
      expect(rootChildren[0]).toBe('block-a')
      expect(rootChildren[2]).toBe('block-b')
      expect(insertedBlockId).toBeDefined()
      expect(state.document.blocks[expectDefined(insertedBlockId)]).toMatchObject({
        id: insertedBlockId,
        type: 'paragraph',
        content: {
          type: 'inline-content',
          version: 1,
          children: [],
        },
      })
      expect(state.selection).toEqual({ type: 'block', blockId: insertedBlockId })
    } finally {
      rendered.cleanup()
    }
  })

  it('disables the gutter drag handle outside a sortable virtual list', () => {
    const editorDocument = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const editor = createEditor(createEditorState(editorDocument))
    const rendered = renderBlockRenderer(editor, [paragraphPlugin], 'block-a')

    try {
      const dragButton = rendered.container.querySelector(
        '[data-vetra-block-drag-handle="block-a"]',
      )
      if (!(dragButton instanceof HTMLButtonElement)) {
        throw new Error('Expected gutter drag button to render.')
      }

      expect(dragButton.disabled).toBe(true)
      expect(dragButton.getAttribute('aria-disabled')).toBe('true')
      expect(dragButton.getAttribute('data-vetra-block-drag-handle-disabled')).toBe('true')
    } finally {
      rendered.cleanup()
    }
  })
})

function readParagraphText(block: ParagraphBlock): string {
  const firstNode = block.content.children[0]

  return firstNode?.type === 'text' ? firstNode.text : ''
}

function expectDefined<TValue>(value: TValue | undefined): TValue {
  expect(value).toBeDefined()

  if (value === undefined) {
    throw new Error('Expected value to be defined.')
  }

  return value
}
