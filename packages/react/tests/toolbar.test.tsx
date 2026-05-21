/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import {
  createEditor,
  createEditorState,
  createTextInlineContent,
  type DocBlock,
  type DocumentState,
  type EditorCommand,
  type EditorRuntime,
  type HeadingBlock,
  type InlineContent,
  type ParagraphBlock,
} from '@vetra/core'
import {
  BlockToolbar,
  createConvertBlockTypeCommand,
  EditorProvider,
  useBlockToolbar,
  type BlockToolbarState,
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

function heading(id: string, level: HeadingBlock['props']['level'], text: string): HeadingBlock {
  return {
    id,
    type: 'heading',
    props: { level },
    content: createTextInlineContent(text),
  }
}

function nestedDocument(): DocumentState {
  return {
    id: 'doc',
    version: 1,
    rootId: 'root',
    blocks: {
      root: { id: 'root', type: 'root' },
      'block-a': paragraph('block-a', 'A'),
      'child-a': paragraph('child-a', 'Child'),
      'block-b': heading('block-b', 2, 'B'),
    },
    children: {
      root: ['block-a', 'block-b'],
      'block-a': ['child-a'],
      'child-a': [],
      'block-b': [],
    },
  }
}

function createRecordingEditor(editor: EditorRuntime, commands: EditorCommand[]): EditorRuntime {
  return {
    dispatch(command) {
      commands.push(command)

      return editor.dispatch(command)
    },
    undo() {
      return editor.undo()
    },
    redo() {
      return editor.redo()
    },
    canUndo() {
      return editor.canUndo()
    },
    canRedo() {
      return editor.canRedo()
    },
    getState() {
      return editor.getState()
    },
    subscribe(listener) {
      return editor.subscribe(listener)
    },
  }
}

function renderToolbar(editor: EditorRuntime) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <EditorProvider blocks={[]} editor={editor}>
        <BlockToolbar />
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

function renderToolbarProbe(
  editor: EditorRuntime,
  onSnapshot: (snapshot: BlockToolbarState) => void,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  function Probe() {
    onSnapshot(useBlockToolbar())

    return null
  }

  act(() => {
    root.render(
      <EditorProvider blocks={[]} editor={editor}>
        <Probe />
      </EditorProvider>,
    )
  })

  return () => {
    unmountRoot(root)
    container.remove()
  }
}

function unmountRoot(root: Root) {
  act(() => {
    root.unmount()
  })
}

function getToolbarButton(container: Element, itemId: string): HTMLButtonElement {
  const button = container.querySelector(`[data-vetra-toolbar-item="${itemId}"]`)
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected toolbar button "${itemId}" to render.`)
  }

  return button
}

function expectCommand(
  command: ReturnType<typeof createConvertBlockTypeCommand>,
): Exclude<ReturnType<typeof createConvertBlockTypeCommand>, undefined> {
  expect(command).toBeDefined()
  if (command === undefined) {
    throw new Error('Expected conversion command to be created.')
  }

  return command
}

describe('Block toolbar state', () => {
  it('reads the active block from normalized editor selection', () => {
    const editor = createEditor(createEditorState(nestedDocument()))
    let snapshot: BlockToolbarState | undefined

    act(() => {
      editor.dispatch({
        type: 'setSelection',
        selection: { type: 'block', blockId: 'block-a' },
      })
    })

    const cleanup = renderToolbarProbe(editor, (nextSnapshot) => {
      snapshot = nextSnapshot
    })

    try {
      expect(snapshot?.activeBlockId).toBe('block-a')
      expect(snapshot?.activeTarget).toEqual({ type: 'paragraph' })
      expect(snapshot?.canConvert).toBe(true)
      expect(snapshot?.items.find((item) => item.id === 'paragraph')).toMatchObject({
        active: true,
        disabled: false,
      })

      act(() => {
        editor.dispatch({
          type: 'setSelection',
          selection: {
            type: 'text',
            blockId: 'block-b',
            anchor: { path: [], offset: 0 },
            focus: { path: [], offset: 0 },
          },
        })
      })

      expect(snapshot?.activeBlockId).toBe('block-b')
      expect(snapshot?.activeTarget).toEqual({ type: 'heading', level: 2 })
      expect(snapshot?.items.find((item) => item.id === 'heading-2')).toMatchObject({
        active: true,
        disabled: false,
      })
    } finally {
      cleanup()
    }
  })

  it('does not dispatch when there is no active block or selection resolves to a missing block', () => {
    const document = nestedDocument()
    const noSelectionCommands: EditorCommand[] = []
    const noSelectionEditor = createRecordingEditor(
      createEditor(createEditorState(document)),
      noSelectionCommands,
    )
    let noSelectionSnapshot: BlockToolbarState | undefined
    const cleanupNoSelection = renderToolbarProbe(noSelectionEditor, (nextSnapshot) => {
      noSelectionSnapshot = nextSnapshot
    })

    try {
      let result: ReturnType<BlockToolbarState['convertBlock']> = undefined
      act(() => {
        result = noSelectionSnapshot?.convertBlock({ type: 'quote' })
      })

      expect(result).toBeUndefined()
      expect(noSelectionCommands).toEqual([])
      expect(noSelectionSnapshot?.canConvert).toBe(false)
    } finally {
      cleanupNoSelection()
    }

    const invalidSelectionCommands: EditorCommand[] = []
    const invalidSelectionEditor = createRecordingEditor(
      createEditor({
        document,
        selection: { type: 'block', blockId: 'missing' },
      }),
      invalidSelectionCommands,
    )
    let invalidSelectionSnapshot: BlockToolbarState | undefined
    const cleanupInvalidSelection = renderToolbarProbe(invalidSelectionEditor, (nextSnapshot) => {
      invalidSelectionSnapshot = nextSnapshot
    })

    try {
      let result: ReturnType<BlockToolbarState['convertBlock']> = undefined
      act(() => {
        result = invalidSelectionSnapshot?.convertBlock({ type: 'quote' })
      })

      expect(result).toBeUndefined()
      expect(invalidSelectionCommands).toEqual([])
      expect(invalidSelectionSnapshot?.activeBlockId).toBeUndefined()
    } finally {
      cleanupInvalidSelection()
    }
  })
})

describe('BlockToolbar', () => {
  it('dispatches convertBlockType and leaves block identity and children to core', () => {
    const editor = createEditor({
      document: nestedDocument(),
      selection: { type: 'block', blockId: 'block-a' },
    })
    const commands: EditorCommand[] = []
    const recordingEditor = createRecordingEditor(editor, commands)
    const rendered = renderToolbar(recordingEditor)

    try {
      act(() => {
        getToolbarButton(rendered.container, 'heading-2').dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })

      expect(commands).toEqual([
        {
          type: 'convertBlockType',
          blockId: 'block-a',
          blockType: 'heading',
          props: { level: 2 },
          content: createTextInlineContent('A'),
        },
      ])
      expect(recordingEditor.getState().document.blocks['block-a']).toMatchObject({
        id: 'block-a',
        type: 'heading',
        props: { level: 2 },
        content: createTextInlineContent('A'),
      })
      expect(recordingEditor.getState().document.children['block-a']).toEqual(['child-a'])
      expect(recordingEditor.getState().document.blocks['child-a']?.id).toBe('child-a')
    } finally {
      rendered.cleanup()
    }
  })
})

describe('block toolbar conversion policy', () => {
  it('flattens rich inline content to plain text when converting to code', () => {
    const content: InlineContent = {
      type: 'inline-content',
      version: 1,
      children: [
        { type: 'text', text: 'Hello ', marks: ['bold'] },
        { type: 'link', href: 'https://example.test', children: [{ type: 'text', text: 'link' }] },
        { type: 'mention', id: 'ada', label: '@ada' },
        { type: 'inline-code', text: 'x = 1' },
      ],
    }
    const block: DocBlock = {
      id: 'block-a',
      type: 'heading',
      props: { level: 1 },
      content,
    }

    expect(expectCommand(createConvertBlockTypeCommand(block, { type: 'code' }))).toEqual({
      type: 'convertBlockType',
      blockId: 'block-a',
      blockType: 'code',
      props: undefined,
      content: 'Hello link@adax = 1',
    })
  })

  it('falls back to text when rich content cannot be preserved safely', () => {
    const block: DocBlock = {
      id: 'block-a',
      type: 'paragraph',
      content: {
        type: 'inline-content',
        version: 1,
        children: [{ type: 'unknown-inline', text: 'not preserved' }],
      },
    }

    expect(expectCommand(createConvertBlockTypeCommand(block, { type: 'code' })).content).toBe('')
    expect(
      expectCommand(
        createConvertBlockTypeCommand({ ...block, content: 'plain' }, { type: 'quote' }),
      ).content,
    ).toEqual(createTextInlineContent('plain'))
  })
})
