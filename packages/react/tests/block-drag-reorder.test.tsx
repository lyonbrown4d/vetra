/** @vitest-environment jsdom */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import {
  createDocument,
  createEditor,
  createEditorState,
  createTextInlineContent,
  type EditorCommand,
  type EditorRuntime,
  type ParagraphBlock,
} from '@vetra/core'
import {
  EditorProvider,
  VirtualBlockList,
  defineReactBlock,
  resolveTopLevelBlockDragMove,
  useBlockDragHandle,
  type AnyReactBlockPlugin,
  type BlockRendererProps,
} from '@vetra/react'

interface MockDragEndEvent {
  readonly active: {
    readonly id: string | number
  }
  readonly over: {
    readonly id: string | number
  } | null
}

type MockDragEndHandler = (event: MockDragEndEvent) => void

interface MockDndContextProps {
  readonly children: ReactNode
  readonly onDragEnd?: MockDragEndHandler
}

interface MockSortableContextProps {
  readonly children: ReactNode
  readonly items: readonly (string | number | { readonly id: string | number })[]
}

interface MockSortableArguments {
  readonly id: string | number
}

interface VirtualizerOptions {
  readonly count: number
}

const dndMock = vi.hoisted(() => {
  let dragEndHandler: MockDragEndHandler | undefined

  return {
    dispatchDragEnd(event: MockDragEndEvent) {
      if (dragEndHandler === undefined) {
        throw new Error('Expected DndContext to register onDragEnd.')
      }

      dragEndHandler(event)
    },
    reset() {
      dragEndHandler = undefined
    },
    setDragEndHandler(handler: MockDragEndHandler | undefined) {
      dragEndHandler = handler
    },
  }
})

vi.mock('@dnd-kit/core', () => ({
  DndContext(props: MockDndContextProps) {
    dndMock.setDragEndHandler(props.onDragEnd)

    return <div data-vetra-test-dnd-context="">{props.children}</div>
  },
  KeyboardSensor: function KeyboardSensor() {
    return undefined
  },
  PointerSensor: function PointerSensor() {
    return undefined
  },
  closestCenter() {
    return []
  },
  useSensor(sensor: unknown, options?: unknown) {
    return { options, sensor }
  },
  useSensors(...sensors: readonly unknown[]) {
    return sensors
  },
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext(props: MockSortableContextProps) {
    const itemIds = props.items
      .map((item) => (typeof item === 'object' ? String(item.id) : String(item)))
      .join(',')

    return <div data-vetra-test-sortable-items={itemIds}>{props.children}</div>
  },
  sortableKeyboardCoordinates() {
    return undefined
  },
  useSortable(args: MockSortableArguments) {
    return {
      attributes: {
        'aria-describedby': `sortable-${String(args.id)}`,
        'aria-disabled': false,
        'aria-pressed': undefined,
        'aria-roledescription': 'sortable',
        role: 'button',
        tabIndex: 0,
      },
      isDragging: false,
      listeners: undefined,
      setActivatorNodeRef() {
        return undefined
      },
      setNodeRef() {
        return undefined
      },
      transform: null,
      transition: undefined,
    }
  },
  verticalListSortingStrategy() {
    return null
  },
}))

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

const paragraphPlugin = defineReactBlock<ParagraphBlock>({
  type: 'paragraph',
  readonlyRenderer: ParagraphReadonly,
})
const testBlocks: readonly AnyReactBlockPlugin[] = [paragraphPlugin]

function ParagraphReadonly(props: BlockRendererProps<ParagraphBlock>) {
  const dragHandle = useBlockDragHandle()

  return (
    <div data-rendered-block={props.block.id}>
      <button
        data-vetra-test-drag-handle={dragHandle.blockId}
        disabled={dragHandle.disabled}
        ref={dragHandle.setActivatorNodeRef}
        type="button"
      >
        Grip
      </button>
      {readParagraphText(props.block)}
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

function renderVirtualList(editor: EditorRuntime) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <EditorProvider blocks={testBlocks} editor={editor}>
        <VirtualBlockList />
      </EditorProvider>,
    )
  })

  return {
    container,
    cleanup() {
      unmountRoot(root)
      container.remove()
      dndMock.reset()
    },
  }
}

function createRecordingEditor(editor: EditorRuntime, commands: EditorCommand[]): EditorRuntime {
  return {
    canRedo() {
      return editor.canRedo()
    },
    canUndo() {
      return editor.canUndo()
    },
    dispatch(command) {
      commands.push(command)

      return editor.dispatch(command)
    },
    getState() {
      return editor.getState()
    },
    redo() {
      return editor.redo()
    },
    subscribe(listener) {
      return editor.subscribe(listener)
    },
    undo() {
      return editor.undo()
    },
  }
}

function unmountRoot(root: Root) {
  act(() => {
    root.unmount()
  })
}

describe('resolveTopLevelBlockDragMove', () => {
  it('returns a root move command for visible top-level blocks', () => {
    expect(
      resolveTopLevelBlockDragMove({
        activeId: 'block-a',
        overId: 'block-c',
        rootId: 'root',
        sortableBlockIds: ['block-a', 'block-b', 'block-c'],
        topLevelBlockIds: ['block-a', 'block-b', 'block-c'],
      }),
    ).toEqual({
      type: 'moveBlock',
      blockId: 'block-a',
      toParentId: 'root',
      toIndex: 2,
    })
  })

  it('ignores non-visible, missing, and no-op drag targets', () => {
    const baseInput = {
      activeId: 'block-a',
      rootId: 'root',
      sortableBlockIds: ['block-a', 'block-b'],
      topLevelBlockIds: ['block-a', 'block-b', 'block-c'],
    }

    expect(resolveTopLevelBlockDragMove({ ...baseInput, overId: 'block-a' })).toBeUndefined()
    expect(resolveTopLevelBlockDragMove({ ...baseInput, overId: 'block-c' })).toBeUndefined()
    expect(
      resolveTopLevelBlockDragMove({ ...baseInput, activeId: 1, overId: 'block-b' }),
    ).toBeUndefined()
  })
})

describe('VirtualBlockList drag reorder', () => {
  it('dispatches moveBlock through core and keeps document order as the source of truth', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B'), paragraph('block-c', 'C')],
    })
    const commands: EditorCommand[] = []
    const recordingEditor = createRecordingEditor(
      createEditor(createEditorState(document)),
      commands,
    )
    const rendered = renderVirtualList(recordingEditor)

    try {
      expect(
        rendered.container.querySelector('[data-vetra-sortable-block="block-a"]'),
      ).not.toBeNull()
      expect(
        rendered.container.querySelector('[data-vetra-test-drag-handle="block-a"]'),
      ).not.toBeNull()
      expect(
        rendered.container
          .querySelector('[data-vetra-block-drag-handle="block-a"]')
          ?.getAttribute('data-vetra-block-drag-handle-disabled'),
      ).toBe('false')

      act(() => {
        dndMock.dispatchDragEnd({
          active: { id: 'block-a' },
          over: { id: 'block-c' },
        })
      })

      expect(commands).toEqual([
        {
          type: 'moveBlock',
          blockId: 'block-a',
          toParentId: 'root',
          toIndex: 2,
        },
      ])
      expect(recordingEditor.getState().document.children.root).toEqual([
        'block-b',
        'block-c',
        'block-a',
      ])
    } finally {
      rendered.cleanup()
    }
  })
})

function readParagraphText(block: ParagraphBlock): string {
  const firstNode = block.content.children[0]

  return firstNode?.type === 'text' ? firstNode.text : ''
}
