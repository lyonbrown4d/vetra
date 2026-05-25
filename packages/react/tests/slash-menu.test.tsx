/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createEditor,
  createEditorState,
  createTextInlineContent,
  type EditorRuntime,
  type ParagraphBlock,
} from '@vetra/core'
import {
  EditorProvider,
  SlashMenu,
  type SlashMenuProps,
  type SlashMenuSelectEvent,
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

function createEditorWithTwoBlocks(): EditorRuntime {
  const editorDocument = createDocument({
    id: 'doc',
    blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
  })

  return createEditor(createEditorState(editorDocument))
}

function renderSlashMenu(editor: EditorRuntime, props: Omit<SlashMenuProps, 'targetBlockId'>) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <EditorProvider blocks={[]} editor={editor}>
        <SlashMenu targetBlockId="block-a" {...props} />
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

function dispatchKeyboardEvent(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }))
  })
}

function getSlashMenu(container: Element): HTMLElement {
  const menu = container.querySelector<HTMLElement>('[data-vetra-slash-menu]')
  if (menu === null) {
    throw new Error('Expected slash menu to render.')
  }

  return menu
}

function getMenuItem(container: Element, itemId: string): HTMLElement {
  const item = container.querySelector<HTMLElement>(`[data-vetra-slash-menu-item="${itemId}"]`)
  if (item === null) {
    throw new Error(`Expected slash menu item "${itemId}" to render.`)
  }

  return item
}

describe('SlashMenu', () => {
  it('inserts the filtered block after the target block with Enter', () => {
    const editor = createEditorWithTwoBlocks()
    let closeCount = 0
    let selectedEvent: SlashMenuSelectEvent | undefined
    const rendered = renderSlashMenu(editor, {
      mode: 'insert-after',
      query: 'quote',
      idFactory: () => 'quote-new',
      onClose: () => {
        closeCount += 1
      },
      onSelect: (event) => {
        selectedEvent = event
      },
    })

    try {
      const menu = getSlashMenu(rendered.container)
      expect(rendered.container.textContent).toContain('Quote')
      expect(rendered.container.textContent).not.toContain('Paragraph')

      dispatchKeyboardEvent(menu, 'Enter')

      const document = editor.getState().document
      expect(document.children[document.rootId]).toEqual(['block-a', 'quote-new', 'block-b'])
      expect(document.blocks['quote-new']).toMatchObject({
        id: 'quote-new',
        type: 'quote',
      })
      expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'quote-new' })
      expect(closeCount).toBe(1)
      expect(selectedEvent?.intent.type).toBe('insertBlock')
      expect(selectedEvent?.result.ok).toBe(true)
    } finally {
      rendered.cleanup()
    }
  })

  it('moves the active item with ArrowDown and ArrowUp', () => {
    const editor = createEditorWithTwoBlocks()
    const rendered = renderSlashMenu(editor, {
      mode: 'insert-after',
      idFactory: () => 'unused',
    })

    try {
      const menu = getSlashMenu(rendered.container)
      expect(getMenuItem(rendered.container, 'paragraph').dataset.active).toBe('true')

      dispatchKeyboardEvent(menu, 'ArrowDown')
      expect(getMenuItem(rendered.container, 'heading').dataset.active).toBe('true')

      dispatchKeyboardEvent(menu, 'ArrowUp')
      expect(getMenuItem(rendered.container, 'paragraph').dataset.active).toBe('true')

      dispatchKeyboardEvent(menu, 'ArrowUp')
      expect(getMenuItem(rendered.container, 'divider').dataset.active).toBe('true')
    } finally {
      rendered.cleanup()
    }
  })

  it('confirms with Tab and jumps with Home/End', () => {
    const editor = createEditorWithTwoBlocks()
    const rendered = renderSlashMenu(editor, {
      mode: 'insert-after',
      idFactory: () => 'home-end',
    })

    try {
      const menu = getSlashMenu(rendered.container)

      dispatchKeyboardEvent(menu, 'Home')
      expect(getMenuItem(rendered.container, 'paragraph').dataset.active).toBe('true')

      dispatchKeyboardEvent(menu, 'End')
      expect(getMenuItem(rendered.container, 'divider').dataset.active).toBe('true')

      dispatchKeyboardEvent(menu, 'Tab')

      const document = editor.getState().document
      expect(document.children[document.rootId]).toEqual(['block-a', 'home-end', 'block-b'])
      expect(document.blocks['home-end']).toMatchObject({
        id: 'home-end',
        type: 'divider',
      })
    } finally {
      rendered.cleanup()
    }
  })

  it('closes on Escape without dispatching a document command', () => {
    const editor = createEditorWithTwoBlocks()
    const beforeDocument = editor.getState().document
    let closeCount = 0
    const rendered = renderSlashMenu(editor, {
      mode: 'insert-after',
      idFactory: () => 'unused',
      onClose: () => {
        closeCount += 1
      },
    })

    try {
      dispatchKeyboardEvent(getSlashMenu(rendered.container), 'Escape')

      expect(closeCount).toBe(1)
      expect(editor.getState().document).toBe(beforeDocument)
    } finally {
      rendered.cleanup()
    }
  })

  it('converts the target block with Enter without allocating a new block id', () => {
    const editor = createEditorWithTwoBlocks()
    let idFactoryCalls = 0
    let selectedEvent: SlashMenuSelectEvent | undefined
    const rendered = renderSlashMenu(editor, {
      mode: 'convert',
      query: 'code',
      idFactory: () => {
        idFactoryCalls += 1
        return 'should-not-be-used'
      },
      onSelect: (event) => {
        selectedEvent = event
      },
    })

    try {
      dispatchKeyboardEvent(getSlashMenu(rendered.container), 'Enter')

      const document = editor.getState().document
      expect(document.children[document.rootId]).toEqual(['block-a', 'block-b'])
      expect(document.blocks['block-a']).toMatchObject({
        id: 'block-a',
        type: 'code',
        content: '',
      })
      expect(document.blocks['block-a']?.props).toBeUndefined()
      expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-a' })
      expect(idFactoryCalls).toBe(0)
      expect(selectedEvent?.intent.type).toBe('convertBlock')
    } finally {
      rendered.cleanup()
    }
  })
})
