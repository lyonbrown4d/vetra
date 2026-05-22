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

interface ClickBlockOptions {
  readonly shiftKey?: boolean
}

function clickBlock(container: Element, blockId: string, options: ClickBlockOptions = {}): void {
  act(() => {
    getBlockShell(container, blockId).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, ...options }),
    )
  })
}

interface PressKeyOptions {
  readonly shiftKey?: boolean
}

function pressEditorKey(container: Element, key: string, options: PressKeyOptions = {}): void {
  act(() => {
    getEditorRoot(container).dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options }),
    )
  })
}

function expectBlockSelected(container: Element, blockId: string, selected: boolean): void {
  expect(getBlockShell(container, blockId).dataset.selected).toBe(selected ? 'true' : 'false')
}

function expectBlockShellState(
  container: Element,
  blockId: string,
  expected: { readonly active: boolean; readonly selected: boolean },
): void {
  const shell = getBlockShell(container, blockId)

  expect(shell.dataset.active).toBe(expected.active ? 'true' : 'false')
  expect(shell.dataset.selected).toBe(expected.selected ? 'true' : 'false')
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

function getSlashMenu(container: Element): HTMLElement {
  const menu = container.querySelector('[data-vetra-slash-menu]')
  if (!(menu instanceof HTMLElement)) {
    throw new Error('Expected slash menu to render.')
  }

  return menu
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
      const slashMenu = getSlashMenu(rendered.container)

      expect(slashMenu.dataset.floating).toBe('true')
      expect(slashMenu.style.position).toBe('fixed')

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

  it('inserts an empty paragraph from the block gutter plus button and activates it', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Anchor'), paragraph('block-b', 'Next')],
      }),
    )

    try {
      act(() => {
        getButton(
          rendered.container,
          '[data-vetra-block-control-block-id="block-a"][data-vetra-block-control="insert-after"]',
        ).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })

      const rootChildren = rendered.latestDocument.children.root ?? []
      const insertedBlockId = rootChildren[1]

      expect(rootChildren).toHaveLength(3)
      expect(rootChildren[0]).toBe('block-a')
      expect(rootChildren[2]).toBe('block-b')
      expect(
        readInlineText(rendered.latestDocument.blocks[expectDefined(insertedBlockId)]?.content),
      ).toBe('')
      expect(rendered.latestDocument.blocks[expectDefined(insertedBlockId)]?.type).toBe('paragraph')
      expect(getBlockShell(rendered.container, expectDefined(insertedBlockId)).dataset.active).toBe(
        'true',
      )
    } finally {
      rendered.cleanup()
    }
  })

  it('marks the clicked block shell as active and selected', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'First block'), paragraph('block-b', 'Selected block')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-b').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      expectBlockShellState(rendered.container, 'block-a', { active: false, selected: false })
      expectBlockShellState(rendered.container, 'block-b', { active: true, selected: true })
    } finally {
      rendered.cleanup()
    }
  })

  it('extends block shell selection with shift-click from the existing anchor', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [
          paragraph('block-a', 'Before range'),
          paragraph('block-b', 'Range anchor'),
          paragraph('block-c', 'Range middle'),
          paragraph('block-d', 'Range focus'),
        ],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-b').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })
      act(() => {
        getBlockShell(rendered.container, 'block-d').dispatchEvent(
          new MouseEvent('click', { bubbles: true, shiftKey: true }),
        )
      })

      expectBlockShellState(rendered.container, 'block-a', { active: false, selected: false })
      expectBlockShellState(rendered.container, 'block-b', { active: false, selected: true })
      expectBlockShellState(rendered.container, 'block-c', { active: false, selected: true })
      expectBlockShellState(rendered.container, 'block-d', { active: false, selected: true })
    } finally {
      rendered.cleanup()
    }
  })

  it('extends and collapses sibling block ranges with Shift+Arrow navigation', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [
          paragraph('block-a', 'First'),
          paragraph('block-b', 'Second'),
          paragraph('block-c', 'Third'),
        ],
      }),
    )

    try {
      clickBlock(rendered.container, 'block-a')
      pressEditorKey(rendered.container, 'ArrowDown', { shiftKey: true })

      expectBlockSelected(rendered.container, 'block-a', true)
      expectBlockSelected(rendered.container, 'block-b', true)
      expectBlockSelected(rendered.container, 'block-c', false)

      pressEditorKey(rendered.container, 'ArrowDown', { shiftKey: true })

      expectBlockSelected(rendered.container, 'block-a', true)
      expectBlockSelected(rendered.container, 'block-b', true)
      expectBlockSelected(rendered.container, 'block-c', true)

      pressEditorKey(rendered.container, 'ArrowUp', { shiftKey: true })

      expectBlockSelected(rendered.container, 'block-a', true)
      expectBlockSelected(rendered.container, 'block-b', true)
      expectBlockSelected(rendered.container, 'block-c', false)

      pressEditorKey(rendered.container, 'ArrowDown')

      expectBlockSelected(rendered.container, 'block-a', false)
      expectBlockSelected(rendered.container, 'block-b', true)
      expectBlockSelected(rendered.container, 'block-c', false)
    } finally {
      rendered.cleanup()
    }
  })

  it('selects all top-level blocks from an active rich text contenteditable target', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [
          paragraph('block-a', 'Editable text'),
          paragraph('block-b', 'Second block'),
          paragraph('block-c', 'Third block'),
        ],
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
      expectBlockShellState(rendered.container, 'block-a', { active: false, selected: true })
      expectBlockShellState(rendered.container, 'block-b', { active: false, selected: true })
      expectBlockShellState(rendered.container, 'block-c', { active: false, selected: true })

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
      expect(rendered.latestDocument.blocks['block-c']).toBeUndefined()

      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(
          new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            key: 'z',
          }),
        )
      })

      expect(rendered.latestDocument.children.root).toEqual(['block-a', 'block-b', 'block-c'])
      expect(rendered.latestDocument.blocks['block-a']).toBeDefined()
      expect(rendered.latestDocument.blocks['block-b']).toBeDefined()
      expect(rendered.latestDocument.blocks['block-c']).toBeDefined()
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
