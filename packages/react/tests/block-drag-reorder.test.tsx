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
  readonly delta?: {
    readonly x: number
    readonly y: number
  }
}

interface MockDragOverEvent {
  readonly active: {
    readonly id: string | number
  }
  readonly over: {
    readonly id: string | number
  } | null
  readonly delta?: {
    readonly x: number
    readonly y: number
  }
}

type MockDragEndHandler = (event: MockDragEndEvent) => void
type MockDragOverHandler = (event: MockDragOverEvent) => void
type MockDragCancelHandler = () => void

interface MockDndContextProps {
  readonly children: ReactNode
  readonly onDragEnd?: MockDragEndHandler
  readonly onDragOver?: MockDragOverHandler
  readonly onDragCancel?: MockDragCancelHandler
}

interface MockSortableContextProps {
  readonly children: ReactNode
  readonly items: readonly (string | number | { readonly id: string | number })[]
}

interface MockSortableArguments {
  readonly id: string | number
}

interface MockSortableTransform {
  readonly x: number
  readonly y: number
  readonly scaleX: number
  readonly scaleY: number
}

interface VirtualizerOptions {
  readonly count: number
}

const dndMock = vi.hoisted(() => {
  let dragEndHandler: MockDragEndHandler | undefined
  let dragOverHandler: MockDragOverHandler | undefined
  let dragCancelHandler: MockDragCancelHandler | undefined
  let sortableTransform: MockSortableTransform | null = null

  return {
    dispatchDragEnd(event: MockDragEndEvent) {
      if (dragEndHandler === undefined) {
        throw new Error('Expected DndContext to register onDragEnd.')
      }

      dragEndHandler({
        ...event,
        delta: event.delta ?? { x: 0, y: 0 },
      })
    },
    dispatchDragOver(event: MockDragOverEvent) {
      if (dragOverHandler === undefined) {
        throw new Error('Expected DndContext to register onDragOver.')
      }

      dragOverHandler({
        ...event,
        delta: event.delta ?? { x: 0, y: 0 },
      })
    },
    dispatchDragCancel() {
      if (dragCancelHandler === undefined) {
        return
      }

      dragCancelHandler()
    },
    reset() {
      dragEndHandler = undefined
      dragOverHandler = undefined
      dragCancelHandler = undefined
      sortableTransform = null
    },
    setDragEndHandler(handler: MockDragEndHandler | undefined) {
      dragEndHandler = handler
    },
    setDragOverHandler(handler: MockDragOverHandler | undefined) {
      dragOverHandler = handler
    },
    setDragCancelHandler(handler: MockDragCancelHandler | undefined) {
      dragCancelHandler = handler
    },
    getSortableTransform() {
      return sortableTransform
    },
    setSortableTransform(transform: MockSortableTransform | null) {
      sortableTransform = transform
    },
  }
})

const virtualizerMock = vi.hoisted(() => {
  let rangeStart = 0
  let rangeLength: number | undefined

  return {
    createVirtualItems(count: number) {
      const itemCount = Math.max(0, Math.min(rangeLength ?? count, count - rangeStart))

      return Array.from({ length: itemCount }, (_, offset) => {
        const index = rangeStart + offset

        return {
          index,
          key: index,
          size: 48,
          start: index * 48,
        }
      })
    },
    reset() {
      rangeStart = 0
      rangeLength = undefined
    },
    setRange(start: number, length: number) {
      rangeStart = start
      rangeLength = length
    },
  }
})

vi.mock('@dnd-kit/core', () => ({
  DndContext(props: MockDndContextProps) {
    dndMock.setDragEndHandler(props.onDragEnd)
    dndMock.setDragOverHandler(props.onDragOver)
    dndMock.setDragCancelHandler(props.onDragCancel)

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
      transform: dndMock.getSortableTransform(),
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
        return virtualizerMock.createVirtualItems(options.count)
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
      virtualizerMock.reset()
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

  it('moves to the end when the over target is the visible tail block and cursor moves downward', () => {
    expect(
      resolveTopLevelBlockDragMove({
        activeId: 'block-a',
        overId: '__vetra-tail__',
        rootId: 'root',
        sortableBlockIds: ['block-a', 'block-b', 'block-c'],
        topLevelBlockIds: ['block-a', 'block-b', 'block-c', 'block-d'],
      }),
    ).toEqual({
      type: 'moveBlock',
      blockId: 'block-a',
      toParentId: 'root',
      toIndex: 3,
    })
  })
})

describe('VirtualBlockList drag reorder', () => {
  it('keeps virtual positioning separate from sortable drag transforms', () => {
    dndMock.setSortableTransform({ scaleX: 1, scaleY: 1, x: 8, y: 12 })
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const commands: EditorCommand[] = []
    const recordingEditor = createRecordingEditor(
      createEditor(createEditorState(document)),
      commands,
    )
    const rendered = renderVirtualList(recordingEditor)

    try {
      const sortableItem = rendered.container.querySelector<HTMLElement>(
        '[data-vetra-sortable-block="block-b"]',
      )
      const dragLayer = rendered.container.querySelector<HTMLElement>(
        '[data-vetra-sortable-drag-layer="block-b"]',
      )

      expect(sortableItem?.style.transform).toBe('translateY(48px)')
      expect(dragLayer?.style.transform).toContain('translate')
      expect(dragLayer?.style.transform).not.toContain('translateY(48px)')
    } finally {
      rendered.cleanup()
    }
  })

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

  it('marks the drag-over block as drop target and clears it after drag ends', () => {
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
      act(() => {
        dndMock.dispatchDragOver({
          active: { id: 'block-a' },
          over: { id: 'block-c' },
        })
      })

      const dragTarget = rendered.container.querySelector<HTMLElement>(
        '[data-vetra-sortable-block="block-c"]',
      )
      if (dragTarget === null) {
        throw new Error('Expected block-c sortable item to render.')
      }

      expect(dragTarget.dataset.vetraDragOver).toBe('true')

      expect(
        rendered.container
          .querySelector('[data-vetra-sortable-block="block-a"]')
          ?.getAttribute('data-vetra-drag-over'),
      ).toBe('false')

      act(() => {
        dndMock.dispatchDragCancel()
      })

      expect(
        rendered.container
          .querySelector('[data-vetra-sortable-block="block-c"]')
          ?.getAttribute('data-vetra-drag-over'),
      ).toBe('false')
      expect(commands).toHaveLength(0)
    } finally {
      rendered.cleanup()
    }
  })

  it('switches the last block drop target to tail when moving down and emits a tail move command', () => {
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
      act(() => {
        dndMock.dispatchDragOver({
          active: { id: 'block-a' },
          delta: { x: 0, y: 20 },
          over: { id: 'block-c' },
        })
      })

      const dragTarget = rendered.container.querySelector<HTMLElement>(
        '[data-vetra-sortable-block="block-c"]',
      )
      if (dragTarget === null) {
        throw new Error('Expected block-c sortable item to render.')
      }

      expect(dragTarget.dataset.vetraDragTailOver).toBe('true')

      act(() => {
        dndMock.dispatchDragEnd({
          active: { id: 'block-a' },
          delta: { x: 0, y: 20 },
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

  it('does not treat the last visible item as the document tail during partial virtualization', () => {
    virtualizerMock.setRange(0, 2)
    const document = createDocument({
      id: 'doc',
      blocks: [
        paragraph('block-a', 'A'),
        paragraph('block-b', 'B'),
        paragraph('block-c', 'C'),
        paragraph('block-d', 'D'),
      ],
    })
    const commands: EditorCommand[] = []
    const recordingEditor = createRecordingEditor(
      createEditor(createEditorState(document)),
      commands,
    )
    const rendered = renderVirtualList(recordingEditor)

    try {
      expect(rendered.container.querySelector('[data-vetra-sortable-block="block-c"]')).toBeNull()

      act(() => {
        dndMock.dispatchDragOver({
          active: { id: 'block-a' },
          delta: { x: 0, y: 20 },
          over: { id: 'block-b' },
        })
      })

      const visibleTailTarget = rendered.container.querySelector<HTMLElement>(
        '[data-vetra-sortable-block="block-b"]',
      )
      if (visibleTailTarget === null) {
        throw new Error('Expected block-b sortable item to render.')
      }

      expect(visibleTailTarget.dataset.vetraDragOver).toBe('true')
      expect(visibleTailTarget.dataset.vetraDragTailOver).toBe('false')

      act(() => {
        dndMock.dispatchDragEnd({
          active: { id: 'block-a' },
          delta: { x: 0, y: 20 },
          over: { id: 'block-b' },
        })
      })

      expect(commands).toEqual([
        {
          type: 'moveBlock',
          blockId: 'block-a',
          toParentId: 'root',
          toIndex: 1,
        },
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
