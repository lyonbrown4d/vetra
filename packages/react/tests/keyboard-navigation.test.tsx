/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import {
  createDocument,
  createEditor,
  createEditorState,
  createTextInlineContent,
  ok,
  type EditorCommand,
  type EditorState,
  type DocBlock,
  type DocumentState,
  type EditorRuntime,
  type InlineContent,
  type ParagraphBlock,
  type Transaction,
} from '@vetra/core'
import {
  BlockRenderer,
  collapseSelectionToBlock,
  defineReactBlock,
  duplicateSelectedBlocks,
  EditorProvider,
  EditorRoot,
  moveSelectedBlocks,
  redoEditorHistory,
  selectAllTopLevelBlocks,
  deleteSelectedBlocks,
  undoEditorHistory,
  useActiveBlock,
  type ActiveBlockState,
  type BlockRendererProps,
} from '@vetra/react'

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

const readonlyBlocks = [
  defineReactBlock<ParagraphBlock>({
    type: 'paragraph',
    readonlyRenderer: ReadonlyParagraph,
  }),
]

function ReadonlyParagraph(props: BlockRendererProps) {
  return <div data-renderer="readonly">{readBlockText(props.block)}</div>
}

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function createThreeBlockDocument(): DocumentState {
  return createDocument({
    id: 'doc',
    blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B'), paragraph('block-c', 'C')],
  })
}

function createFourBlockDocument(): DocumentState {
  return createDocument({
    id: 'doc',
    blocks: [
      paragraph('block-a', 'A'),
      paragraph('block-b', 'B'),
      paragraph('block-c', 'C'),
      paragraph('block-d', 'D'),
    ],
  })
}

function createNestedRangeDocument(): DocumentState {
  const document = createDocument({
    id: 'doc',
    blocks: [
      paragraph('block-a', 'A'),
      paragraph('block-b', 'B'),
      paragraph('block-b-child', 'Child'),
      paragraph('block-c', 'C'),
    ],
  })

  return {
    ...document,
    children: {
      ...document.children,
      root: ['block-a', 'block-b', 'block-c'],
      'block-b': ['block-b-child'],
      'block-b-child': [],
    },
  }
}

function createActionProbeEditor(
  document: DocumentState,
  selection: EditorState['selection'],
): {
  readonly editor: EditorRuntime
  readonly commands: readonly EditorCommand[]
} {
  let state: EditorState = { document, selection }
  const commands: EditorCommand[] = []

  const createTransaction = (command: EditorCommand, before: EditorState): Transaction => ({
    command,
    before,
    after: state,
    changedBlockIds: [],
  })

  return {
    commands,
    editor: {
      dispatch(command) {
        commands.push(command)
        const before = state

        if ('selection' in command) {
          state = {
            ...state,
            selection: command.selection,
          }
        }

        return ok(createTransaction(command, before))
      },
      undo() {
        throw new Error('Unexpected undo call in action helper probe.')
      },
      redo() {
        throw new Error('Unexpected redo call in action helper probe.')
      },
      canUndo() {
        return false
      },
      canRedo() {
        return false
      },
      getState() {
        return state
      },
      subscribe() {
        return () => undefined
      },
    },
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
        blocks={readonlyBlocks}
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

function renderUnmountProbe(
  editor: EditorRuntime,
  onSnapshot: (snapshot: ActiveBlockState) => void,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  function Probe(props: { readonly showSelectedBlock: boolean }) {
    onSnapshot(useActiveBlock())

    return props.showSelectedBlock ? <BlockRenderer blockId="block-b" /> : null
  }

  const render = (showSelectedBlock: boolean) => {
    act(() => {
      root.render(
        <EditorProvider blocks={readonlyBlocks} editor={editor}>
          <Probe showSelectedBlock={showSelectedBlock} />
        </EditorProvider>,
      )
    })
  }

  render(true)

  return {
    render,
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

function selectBlock(container: Element, blockId: string): void {
  act(() => {
    getBlockShell(container, blockId).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

interface PressKeyOptions {
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly shiftKey?: boolean
  readonly altKey?: boolean
}

function pressKey(container: Element, key: string, options: PressKeyOptions = {}): void {
  act(() => {
    getEditorRoot(container).dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options }),
    )
  })
}

function expectSelectedBlock(container: Element, blockId: string): void {
  expect(getBlockShell(container, blockId).dataset.selected).toBe('true')
}

describe('keyboard navigation', () => {
  it('moves block selection with ArrowUp and ArrowDown by stable sibling ids', () => {
    const rendered = renderEditor(createThreeBlockDocument())

    try {
      selectBlock(rendered.container, 'block-b')
      expectSelectedBlock(rendered.container, 'block-b')

      pressKey(rendered.container, 'ArrowDown')
      expectSelectedBlock(rendered.container, 'block-c')

      pressKey(rendered.container, 'ArrowUp')
      expectSelectedBlock(rendered.container, 'block-b')
    } finally {
      rendered.cleanup()
    }
  })

  it('deletes the selected block and moves selection to the next sibling', () => {
    const rendered = renderEditor(createThreeBlockDocument())

    try {
      selectBlock(rendered.container, 'block-b')
      pressKey(rendered.container, 'Delete')

      expect(rendered.latestDocument.children.root).toEqual(['block-a', 'block-c'])
      expect(rendered.latestDocument.blocks['block-b']).toBeUndefined()
      expectSelectedBlock(rendered.container, 'block-c')
    } finally {
      rendered.cleanup()
    }
  })

  it('selects all top-level blocks from the editor shell and deletes the range through commands', () => {
    const rendered = renderEditor(createThreeBlockDocument())

    try {
      pressKey(rendered.container, 'a', { ctrlKey: true })
      pressKey(rendered.container, 'Delete')

      expect(rendered.latestDocument.children.root).toEqual([])
      expect(rendered.latestDocument.blocks['block-a']).toBeUndefined()
      expect(rendered.latestDocument.blocks['block-b']).toBeUndefined()
      expect(rendered.latestDocument.blocks['block-c']).toBeUndefined()
    } finally {
      rendered.cleanup()
    }
  })

  it('sets a block selection when selecting all in a single-block document', () => {
    const editorDocument = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A')],
    })
    const editor = createEditor(createEditorState(editorDocument))

    expect(selectAllTopLevelBlocks(editor)).toBe('block-a')
    expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-a' })
  })

  it('deletes a range-block selection and moves selection to the next sibling', () => {
    const editor = createEditor(createEditorState(createThreeBlockDocument()))

    act(() => {
      editor.dispatch({
        type: 'setSelection',
        selection: { type: 'range-block', anchorBlockId: 'block-a', focusBlockId: 'block-b' },
      })
    })

    expect(deleteSelectedBlocks(editor)).toEqual({
      deletedBlockIds: ['block-a', 'block-b'],
      nextBlockId: 'block-c',
    })
    expect(editor.getState().document.children.root).toEqual(['block-c'])
    expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-c' })
  })

  it('dispatches duplicateBlocks for a range selection with a full subtree id map', () => {
    const { editor, commands } = createActionProbeEditor(createNestedRangeDocument(), {
      type: 'range-block',
      anchorBlockId: 'block-a',
      focusBlockId: 'block-b',
    })
    const contexts: {
      readonly sourceBlockId: string
      readonly sourceRootBlockId: string
      readonly index: number
      readonly text: string
      readonly isSelectedRoot: boolean
    }[] = []

    const result = duplicateSelectedBlocks(editor, (context) => {
      contexts.push({
        sourceBlockId: context.sourceBlockId,
        sourceRootBlockId: context.sourceRootBlockId,
        index: context.index,
        text: context.text,
        isSelectedRoot: context.isSelectedRoot,
      })

      return `copy-${context.sourceBlockId}`
    })

    expect(result).toEqual({
      sourceBlockIds: ['block-a', 'block-b'],
      duplicatedBlockIds: ['copy-block-a', 'copy-block-b'],
      idMap: {
        'block-a': 'copy-block-a',
        'block-b': 'copy-block-b',
        'block-b-child': 'copy-block-b-child',
      },
      selection: {
        type: 'range-block',
        anchorBlockId: 'copy-block-a',
        focusBlockId: 'copy-block-b',
      },
      focusBlockId: 'copy-block-b',
    })
    expect(commands).toEqual([
      {
        type: 'duplicateBlocks',
        blockIds: ['block-a', 'block-b'],
        placement: 'after',
        idMap: {
          'block-a': 'copy-block-a',
          'block-b': 'copy-block-b',
          'block-b-child': 'copy-block-b-child',
        },
        selection: {
          type: 'range-block',
          anchorBlockId: 'copy-block-a',
          focusBlockId: 'copy-block-b',
        },
      },
    ])
    expect(contexts).toEqual([
      {
        sourceBlockId: 'block-a',
        sourceRootBlockId: 'block-a',
        index: 0,
        text: 'A',
        isSelectedRoot: true,
      },
      {
        sourceBlockId: 'block-b',
        sourceRootBlockId: 'block-b',
        index: 1,
        text: 'B',
        isSelectedRoot: true,
      },
      {
        sourceBlockId: 'block-b-child',
        sourceRootBlockId: 'block-b',
        index: 2,
        text: 'Child',
        isSelectedRoot: false,
      },
    ])
    expect(editor.getState().selection).toEqual({
      type: 'range-block',
      anchorBlockId: 'copy-block-a',
      focusBlockId: 'copy-block-b',
    })
  })

  it('dispatches moveBlocks for a range selection and keeps the selection', () => {
    const selection = {
      type: 'range-block',
      anchorBlockId: 'block-b',
      focusBlockId: 'block-c',
    } as const
    const { editor, commands } = createActionProbeEditor(createFourBlockDocument(), selection)

    expect(moveSelectedBlocks(editor, 'next')).toEqual({
      movedBlockIds: ['block-b', 'block-c'],
      direction: 'next',
      toParentId: 'root',
      toIndex: 2,
      selection,
      focusBlockId: 'block-c',
    })
    expect(commands).toEqual([
      {
        type: 'moveBlocks',
        blockIds: ['block-b', 'block-c'],
        toParentId: 'root',
        toIndex: 2,
        selection,
      },
    ])
    expect(editor.getState().selection).toEqual(selection)
  })

  it('does not dispatch moveBlocks when the selected range cannot move further', () => {
    const { editor, commands } = createActionProbeEditor(createThreeBlockDocument(), {
      type: 'range-block',
      anchorBlockId: 'block-a',
      focusBlockId: 'block-b',
    })

    expect(moveSelectedBlocks(editor, 'previous')).toBeUndefined()
    expect(commands).toEqual([])
  })

  it('collapses text selection back to block selection for Escape handling', () => {
    const editor = createEditor(createEditorState(createThreeBlockDocument()))

    act(() => {
      editor.dispatch({
        type: 'setSelection',
        selection: {
          type: 'text',
          blockId: 'block-b',
          anchor: { path: [], offset: 0 },
          focus: { path: [], offset: 1 },
        },
      })
    })

    expect(collapseSelectionToBlock(editor)).toBe('block-b')
    expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-b' })
  })

  it('collapses range-block selection to the focus block for Escape handling', () => {
    const editor = createEditor(createEditorState(createThreeBlockDocument()))

    act(() => {
      editor.dispatch({
        type: 'setSelection',
        selection: { type: 'range-block', anchorBlockId: 'block-a', focusBlockId: 'block-c' },
      })
    })

    expect(collapseSelectionToBlock(editor)).toBe('block-c')
    expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-c' })
  })

  it('bridges undo and redo shortcuts to the runtime history API only', () => {
    const editor = createEditor(createEditorState(createThreeBlockDocument()))

    act(() => {
      editor.dispatch({
        type: 'updateBlock',
        blockId: 'block-b',
        patch: {
          content: createTextInlineContent('Changed'),
        },
      })
    })

    expect(readBlockText(expectDefined(editor.getState().document.blocks['block-b']))).toBe(
      'Changed',
    )

    expect(undoEditorHistory(editor)).toBe(true)
    expect(readBlockText(expectDefined(editor.getState().document.blocks['block-b']))).toBe('B')

    expect(redoEditorHistory(editor)).toBe(true)
    expect(readBlockText(expectDefined(editor.getState().document.blocks['block-b']))).toBe(
      'Changed',
    )
  })

  it('keeps selection when a virtualized selected block unmounts', () => {
    const editor = createEditor(createEditorState(createThreeBlockDocument()))
    let snapshot: ActiveBlockState | undefined

    act(() => {
      editor.dispatch({
        type: 'setSelection',
        selection: { type: 'block', blockId: 'block-b' },
      })
    })

    const rendered = renderUnmountProbe(editor, (nextSnapshot) => {
      snapshot = nextSnapshot
    })

    try {
      expect(snapshot?.blockId).toBe('block-b')

      rendered.render(false)

      expect(editor.getState().selection).toEqual({ type: 'block', blockId: 'block-b' })
      expect(snapshot?.blockId).toBe('block-b')
      expect(snapshot?.block?.id).toBe('block-b')
    } finally {
      rendered.cleanup()
    }
  })
})

function readBlockText(block: DocBlock): string {
  if (block.type !== 'paragraph' || !isInlineContent(block.content)) {
    return ''
  }

  const firstNode = block.content.children[0]

  return firstNode?.type === 'text' ? firstNode.text : ''
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
