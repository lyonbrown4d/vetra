/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import {
  createDocument,
  createTextInlineContent,
  type DocBlock,
  type DocumentState,
  type InlineContent,
  type ParagraphBlock,
} from '@vetra/core'
import { EditorRoot, type AnyReactBlockPlugin, type BlockRendererProps } from '@vetra/react'

interface VirtualizerOptions {
  readonly count: number
}

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer(options: VirtualizerOptions) {
    return {
      getTotalSize() {
        return options.count * 48
      },
      getVirtualItems() {
        return Array.from({ length: options.count }, (_, index) => ({
          index,
          key: index,
          size: 48,
          start: index * 48,
        }))
      },
      measureElement() {
        return undefined
      },
    }
  },
}))

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const basicTestBlocks: readonly AnyReactBlockPlugin[] = [
  createReadonlyPlugin('paragraph'),
  createReadonlyPlugin('heading'),
  createReadonlyPlugin('quote'),
  createReadonlyPlugin('code'),
  createReadonlyPlugin('divider'),
]

function createReadonlyPlugin(type: string): AnyReactBlockPlugin {
  if (type === 'paragraph') {
    return {
      type,
      readonlyRenderer: ReadonlyBlock,
      activeRenderer: ActiveEditableBlock,
    }
  }

  return {
    type,
    readonlyRenderer: ReadonlyBlock,
  }
}

function ReadonlyBlock(props: BlockRendererProps) {
  return (
    <div className="vetra-block" data-rendered-block-type={props.block.type}>
      {readBlockText(props.block)}
    </div>
  )
}

function ActiveEditableBlock(props: BlockRendererProps) {
  return (
    <div
      className="vetra-inline-editor"
      contentEditable
      data-active-inline-editor="true"
      suppressContentEditableWarning
    >
      {readBlockText(props.block)}
    </div>
  )
}

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function renderEditor(editorDocument: DocumentState) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let latestDocument = editorDocument

  act(() => {
    root.render(
      <EditorRoot
        blocks={basicTestBlocks}
        initialValue={editorDocument}
        onChange={(nextDocument) => {
          latestDocument = nextDocument
        }}
      />,
    )
  })

  return {
    container,
    get latestDocument() {
      return latestDocument
    },
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

function getEditorRoot(container: Element): HTMLElement {
  const root = container.querySelector('.vetra-editor-root')
  if (!(root instanceof HTMLElement)) {
    throw new Error('Expected editor root to render.')
  }

  return root
}

function getBlockShell(container: Element, blockId: string): HTMLElement {
  const shell = container.querySelector(`[data-vetra-block-shell="${blockId}"]`)
  if (!(shell instanceof HTMLElement)) {
    throw new Error(`Expected block shell "${blockId}" to render.`)
  }

  return shell
}

function getActiveEditableBlock(container: Element): HTMLElement {
  const editor = container.querySelector('[data-active-inline-editor="true"]')
  if (!(editor instanceof HTMLElement)) {
    throw new Error('Expected active editable block to render.')
  }

  return editor
}

function getButton(container: Element, selector: string): HTMLButtonElement {
  const button = container.querySelector(selector)
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button "${selector}" to render.`)
  }

  return button
}

describe('EditorRoot integrated interactions', () => {
  it('converts the active block from the toolbar', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Title')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-a').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })
      act(() => {
        getButton(rendered.container, '[data-vetra-toolbar-item="heading-2"]').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      expect(rendered.latestDocument.blocks['block-a']).toMatchObject({
        id: 'block-a',
        type: 'heading',
        props: { level: 2 },
      })
      expect(readInlineText(rendered.latestDocument.blocks['block-a']?.content)).toBe('Title')
    } finally {
      rendered.cleanup()
    }
  })

  it('opens slash menu from the active block and inserts a selected block after it', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Anchor')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-a').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, key: '/' }),
        )
      })
      act(() => {
        getButton(rendered.container, '[data-vetra-slash-menu-item="quote"]').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      const rootChildren = rendered.latestDocument.children.root ?? []
      const insertedBlockId = rootChildren[1]

      expect(rootChildren).toHaveLength(2)
      expect(insertedBlockId).toBeDefined()
      expect(rendered.latestDocument.blocks[expectDefined(insertedBlockId)]?.type).toBe('quote')
    } finally {
      rendered.cleanup()
    }
  })

  it('selects all top-level blocks from an active rich text contenteditable target', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Editable text'), paragraph('block-b', 'Second block')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-a').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        key: 'a',
      })
      let dispatchResult = false

      act(() => {
        dispatchResult = getActiveEditableBlock(rendered.container).dispatchEvent(event)
      })

      expect(dispatchResult).toBe(false)
      expect(event.defaultPrevented).toBe(true)

      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(
          new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Delete',
          }),
        )
      })

      expect(rendered.latestDocument.children.root).toEqual([])
      expect(rendered.latestDocument.blocks['block-a']).toBeUndefined()
      expect(rendered.latestDocument.blocks['block-b']).toBeUndefined()
    } finally {
      rendered.cleanup()
    }
  })

  it('pastes plain text after the active block', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Anchor')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-a').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(createPasteEvent('First\n\nSecond'))
      })

      const rootChildren = rendered.latestDocument.children.root ?? []

      expect(rootChildren).toHaveLength(3)
      expect(
        readInlineText(rendered.latestDocument.blocks[expectDefined(rootChildren[1])]?.content),
      ).toBe('First')
      expect(
        readInlineText(rendered.latestDocument.blocks[expectDefined(rootChildren[2])]?.content),
      ).toBe('Second')
    } finally {
      rendered.cleanup()
    }
  })
})

function createPasteEvent(text: string): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true })

  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData(format: string) {
        return format === 'text/plain' ? text : ''
      },
    },
  })

  return event
}

function readBlockText(block: DocBlock): string {
  if (typeof block.content === 'string') {
    return block.content
  }

  return readInlineText(block.content)
}

function readInlineText(content: unknown): string {
  if (!isInlineContent(content)) {
    return ''
  }

  return content.children
    .map((node) => (node.type === 'text' || node.type === 'inline-code' ? node.text : ''))
    .join('')
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
