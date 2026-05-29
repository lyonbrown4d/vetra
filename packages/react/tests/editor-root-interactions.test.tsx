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
import {
  EditorRoot,
  type AnyReactBlockPlugin,
  type BlockRendererProps,
  VETRA_BLOCK_CLIPBOARD_MIME_TYPE,
} from '@vetra/react'
import { parseDocument } from '@vetra/persistence-json'

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

function pressActiveElementKey(key: string, options: PressKeyOptions = {}): void {
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement)) {
    throw new Error('Expected an active element to receive keyboard input.')
  }

  act(() => {
    activeElement.dispatchEvent(
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

function querySlashMenu(container: Element): HTMLElement | null {
  const menu = container.querySelector('[data-vetra-slash-menu]')
  return menu instanceof HTMLElement ? menu : null
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
      expect(document.activeElement).toBe(slashMenu)

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

  it('navigates the focused slash menu with the keyboard and inserts the selected block', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Anchor'), paragraph('block-b', 'Next')],
      }),
    )

    try {
      clickBlock(rendered.container, 'block-a')
      pressEditorKey(rendered.container, '/')
      const slashMenu = getSlashMenu(rendered.container)

      expect(document.activeElement).toBe(slashMenu)

      pressActiveElementKey('ArrowDown')
      expect(
        getButton(rendered.container, '[data-vetra-slash-menu-item="heading"]').dataset.active,
      ).toBe('true')

      pressActiveElementKey('Enter')

      const rootChildren = rendered.latestDocument.children.root ?? []
      const insertedBlockId = rootChildren[1]

      expect(rootChildren).toHaveLength(3)
      expect(insertedBlockId).toBeDefined()
      expect(rendered.latestDocument.blocks[expectDefined(insertedBlockId)]).toMatchObject({
        id: insertedBlockId,
        type: 'heading',
        props: { level: 2 },
      })
      expect(querySlashMenu(rendered.container)).toBeNull()
    } finally {
      rendered.cleanup()
    }
  })

  it('keeps change notifications after replacing the initial document', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const changes: DocumentState[] = []
    const firstDocument: DocumentState = {
      ...createDocument({
        id: 'first-doc',
        blocks: [paragraph('old-block', 'Old')],
      }),
      version: 2,
    }
    const secondDocument = createDocument({
      id: 'second-doc',
      blocks: [paragraph('block-a', 'Anchor')],
    })

    try {
      act(() => {
        root.render(
          <EditorRoot
            blocks={basicTestBlocks}
            initialValue={firstDocument}
            onChange={(nextDocument) => {
              changes.push(nextDocument)
            }}
          />,
        )
      })
      act(() => {
        root.render(
          <EditorRoot
            blocks={basicTestBlocks}
            initialValue={secondDocument}
            onChange={(nextDocument) => {
              changes.push(nextDocument)
            }}
          />,
        )
      })
      act(() => {
        getButton(
          container,
          '[data-vetra-block-control-block-id="block-a"][data-vetra-block-control="insert-after"]',
        ).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })

      expect(changes).toHaveLength(1)
      expect(changes[0]?.id).toBe('second-doc')
      expect(changes[0]?.version).toBe(2)
      expect(changes[0]?.children.root).toHaveLength(2)
    } finally {
      unmountRoot(root)
      container.remove()
    }
  })

  it('inserts from slash menu when crypto.randomUUID is unavailable', () => {
    withCryptoWithoutRandomUUID(() => {
      const rendered = renderEditor(
        createDocument({
          id: 'doc',
          blocks: [paragraph('block-a', 'Anchor')],
        }),
      )

      try {
        clickBlock(rendered.container, 'block-a')
        pressEditorKey(rendered.container, '/')
        act(() => {
          getButton(rendered.container, '[data-vetra-slash-menu-item="quote"]').dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
          )
        })

        const rootChildren = rendered.latestDocument.children.root ?? []
        const insertedBlockId = expectDefined(rootChildren[1])

        expect(insertedBlockId).toMatch(/^slash-local-/)
        expect(rendered.latestDocument.blocks[insertedBlockId]?.type).toBe('quote')
      } finally {
        rendered.cleanup()
      }
    })
  })

  it('inserts an empty paragraph from the block gutter plus button and activates it', async () => {
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
      await waitForScheduledFocus()
      expect(document.activeElement).toBe(getActiveEditableBlock(rendered.container))
    } finally {
      rendered.cleanup()
    }
  })

  it('preserves root behavior when callers provide a custom className', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let latestDocument = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'Anchor')],
    })

    try {
      act(() => {
        root.render(
          <EditorRoot
            blocks={basicTestBlocks}
            className="custom-vetra-shell"
            initialValue={latestDocument}
            onChange={(nextDocument) => {
              latestDocument = nextDocument
            }}
          />,
        )
      })

      expect(getEditorRoot(container).classList.contains('custom-vetra-shell')).toBe(true)

      act(() => {
        getButton(
          container,
          '[data-vetra-block-control-block-id="block-a"][data-vetra-block-control="insert-after"]',
        ).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })

      const insertedBlockId = expectDefined((latestDocument.children.root ?? [])[1])

      await waitForScheduledFocus()
      expect(getBlockShell(container, insertedBlockId).dataset.active).toBe('true')
      expect(document.activeElement).toBe(getActiveEditableBlock(container))
    } finally {
      unmountRoot(root)
      container.remove()
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

  it('selects all top-level blocks from a shell key command and keeps shell focus', () => {
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
      act(() => {
        getBlockShell(rendered.container, 'block-b').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(
          new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            key: 'a',
          }),
        )
      })

      expectBlockShellState(rendered.container, 'block-a', { active: false, selected: true })
      expectBlockShellState(rendered.container, 'block-b', { active: false, selected: true })
      expectBlockShellState(rendered.container, 'block-c', { active: false, selected: true })
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

  it('replaces a range block selection when pasting plain text', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [
          paragraph('block-a', 'Before'),
          paragraph('block-b', 'Replace B'),
          paragraph('block-c', 'Replace C'),
          paragraph('block-d', 'After'),
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
        getBlockShell(rendered.container, 'block-c').dispatchEvent(
          new MouseEvent('click', { bubbles: true, shiftKey: true }),
        )
      })
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(createPasteEvent('Inserted'))
      })

      const rootChildren = rendered.latestDocument.children.root ?? []
      const insertedBlockId = expectDefined(rootChildren[1])

      expect(rootChildren).toHaveLength(3)
      expect(rootChildren[0]).toBe('block-a')
      expect(rootChildren[2]).toBe('block-d')
      expect(rendered.latestDocument.blocks['block-b']).toBeUndefined()
      expect(rendered.latestDocument.blocks['block-c']).toBeUndefined()
      expect(readInlineText(rendered.latestDocument.blocks[insertedBlockId]?.content)).toBe(
        'Inserted',
      )
    } finally {
      rendered.cleanup()
    }
  })

  it('pastes HTML clipboard data as imported heading and paragraph blocks', () => {
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
          createClipboardEvent('paste', {
            'text/html': '<h2>Imported title</h2><p>Imported body</p>',
            'text/plain': 'Plain fallback',
          }),
        )
      })

      const rootChildren = rendered.latestDocument.children.root ?? []
      const headingBlockId = expectDefined(rootChildren[1])
      const paragraphBlockId = expectDefined(rootChildren[2])

      expect(rootChildren).toHaveLength(3)
      expect(rendered.latestDocument.blocks[headingBlockId]).toMatchObject({
        type: 'heading',
        props: { level: 2 },
      })
      expect(readInlineText(rendered.latestDocument.blocks[headingBlockId]?.content)).toBe(
        'Imported title',
      )
      expect(rendered.latestDocument.blocks[paragraphBlockId]?.type).toBe('paragraph')
      expect(readInlineText(rendered.latestDocument.blocks[paragraphBlockId]?.content)).toBe(
        'Imported body',
      )
    } finally {
      rendered.cleanup()
    }
  })

  it('closes the slash menu when clicking another block', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Anchor'), paragraph('block-b', 'Next')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-a').dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        )
      })
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: '/' }),
        )
      })

      expect(querySlashMenu(rendered.container)).not.toBeNull()

      act(() => {
        getBlockShell(rendered.container, 'block-b').dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
        )
      })

      expect(querySlashMenu(rendered.container)).toBeNull()
    } finally {
      rendered.cleanup()
    }
  })

  it('prefers Vetra block clipboard payload over HTML clipboard data', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Copied'), paragraph('block-b', 'Anchor')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-a').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      const copyEvent = createClipboardEvent('copy')
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(copyEvent)
      })

      const copiedPayload = copyEvent.clipboardData?.getData(VETRA_BLOCK_CLIPBOARD_MIME_TYPE) ?? ''
      expect(copiedPayload.length).toBeGreaterThan(0)

      act(() => {
        getBlockShell(rendered.container, 'block-b').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(
          createClipboardEvent('paste', {
            [VETRA_BLOCK_CLIPBOARD_MIME_TYPE]: copiedPayload,
            'text/html': '<h1>HTML should not win</h1>',
            'text/plain': 'Plain fallback',
          }),
        )
      })

      const rootChildren = rendered.latestDocument.children.root ?? []
      const pastedBlockId = expectDefined(rootChildren[2])

      expect(rootChildren).toHaveLength(3)
      expect(rendered.latestDocument.blocks[pastedBlockId]?.type).toBe('paragraph')
      expect(readInlineText(rendered.latestDocument.blocks[pastedBlockId]?.content)).toBe('Copied')
      expect(
        Object.values(rendered.latestDocument.blocks).some(
          (block) => readInlineText(block.content) === 'HTML should not win',
        ),
      ).toBe(false)
    } finally {
      rendered.cleanup()
    }
  })

  it('copies selected blocks as block payload, then pastes them with selection intent', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Anchor'), paragraph('block-b', 'Copied')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-a').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      const copyEvent = createClipboardEvent('copy')
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(copyEvent)
      })

      const copiedPayload = copyEvent.clipboardData?.getData(VETRA_BLOCK_CLIPBOARD_MIME_TYPE) ?? ''
      expect(copiedPayload.length).toBeGreaterThan(0)
      expect(copyEvent.defaultPrevented).toBe(true)

      const parsedPayload = parseDocument(copiedPayload)
      if (!parsedPayload.ok) {
        throw new Error(parsedPayload.error.message)
      }

      expect(parsedPayload.value.children[parsedPayload.value.rootId]).toEqual(['block-a'])

      act(() => {
        getBlockShell(rendered.container, 'block-b').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(
          createClipboardEvent('paste', { [VETRA_BLOCK_CLIPBOARD_MIME_TYPE]: copiedPayload }),
        )
      })

      const rootChildren = rendered.latestDocument.children.root ?? []
      expect(rootChildren).toHaveLength(3)
      expect(rootChildren[0]).toBe('block-a')
      expect(rootChildren[1]).toBe('block-b')
      const pastedBlockId = expectDefined(rootChildren[2])
      expect(readInlineText(rendered.latestDocument.blocks[pastedBlockId]?.content)).toBe('Anchor')
      expect(rendered.latestDocument.blocks[pastedBlockId]?.type).toBe('paragraph')
    } finally {
      rendered.cleanup()
    }
  })

  it('cuts selected blocks and inserts their payload on next paste', () => {
    const rendered = renderEditor(
      createDocument({
        id: 'doc',
        blocks: [paragraph('block-a', 'Anchor'), paragraph('block-b', 'Removed')],
      }),
    )

    try {
      act(() => {
        getBlockShell(rendered.container, 'block-a').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      const cutEvent = createClipboardEvent('cut')
      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(cutEvent)
      })

      const cutPayload = cutEvent.clipboardData?.getData(VETRA_BLOCK_CLIPBOARD_MIME_TYPE) ?? ''
      expect(cutEvent.defaultPrevented).toBe(true)
      expect(rendered.latestDocument.children.root).toEqual(['block-b'])

      act(() => {
        getEditorRoot(rendered.container).dispatchEvent(
          createClipboardEvent('paste', {
            'text/plain': 'Fallback text',
            [VETRA_BLOCK_CLIPBOARD_MIME_TYPE]: cutPayload,
          }),
        )
      })

      const rootChildren = rendered.latestDocument.children.root ?? []
      expect(rootChildren).toHaveLength(2)
      expect(rootChildren[1]).toMatch(/^paste-/)
      expect(
        readInlineText(rendered.latestDocument.blocks[expectDefined(rootChildren[1])]?.content),
      ).toBe('Anchor')
    } finally {
      rendered.cleanup()
    }
  })
})

function createPasteEvent(text: string, extraData: Record<string, string> = {}): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  const data: Record<string, string> = {
    ...extraData,
    'text/plain': text,
  }

  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData(format: string) {
        return data[format] ?? ''
      },
      setData(format: string, value: string) {
        data[format] = value
        return true
      },
    },
  })

  return event as ClipboardEvent
}

function createClipboardEvent(
  type: 'copy' | 'cut' | 'paste',
  extraData: Record<string, string> = {},
): ClipboardEvent {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const data: Record<string, string> = {
    ...extraData,
  }

  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData(format: string) {
        return data[format] ?? ''
      },
      setData(format: string, value: string) {
        data[format] = value
        return true
      },
    },
  })

  return event as ClipboardEvent
}

function withCryptoWithoutRandomUUID(run: () => void): void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {},
  })

  try {
    run()
  } finally {
    if (originalDescriptor === undefined) {
      Reflect.deleteProperty(globalThis, 'crypto')
    } else {
      Object.defineProperty(globalThis, 'crypto', originalDescriptor)
    }
  }
}

async function waitForScheduledFocus(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => {
          resolve()
        })
        return
      }

      globalThis.setTimeout(resolve, 0)
    })
  })
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
