import { useCallback, useMemo, type CSSProperties, type ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BlockId, MoveBlockCommand } from '@vetra/core'
import { useEditor } from '@vetra/react/context/EditorContext'
import {
  BlockDragHandleProvider,
  type BlockDragHandleState,
} from '@vetra/react/drag/BlockDragHandleContext'

export interface SortableBlockListProps {
  readonly blockIds: readonly BlockId[]
  readonly children: ReactNode
  readonly rootId: BlockId
  readonly sortableBlockIds: readonly BlockId[]
}

export interface SortableBlockProps {
  readonly blockId: BlockId
  readonly children: ReactNode
  readonly index: number
  readonly measureElement: (element: HTMLDivElement | null) => void
  readonly start: number
}

export interface ResolveTopLevelBlockDragMoveInput {
  readonly activeId: UniqueIdentifier
  readonly overId: UniqueIdentifier | null
  readonly rootId: BlockId
  readonly sortableBlockIds: readonly BlockId[]
  readonly topLevelBlockIds: readonly BlockId[]
}

export function SortableBlockList(props: SortableBlockListProps) {
  const editor = useEditor()
  const sortableItems = useMemo(() => [...props.sortableBlockIds], [props.sortableBlockIds])
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const command = resolveTopLevelBlockDragMove({
        activeId: event.active.id,
        overId: event.over?.id ?? null,
        rootId: props.rootId,
        sortableBlockIds: props.sortableBlockIds,
        topLevelBlockIds: props.blockIds,
      })

      if (command !== undefined) {
        editor.dispatch(command)
      }
    },
    [editor, props.blockIds, props.rootId, props.sortableBlockIds],
  )

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
        {props.children}
      </SortableContext>
    </DndContext>
  )
}

export function SortableBlock(props: SortableBlockProps) {
  const { blockId, children, index, measureElement, start } = props
  const sortable = useSortable({ id: blockId })
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = sortable
  const setMeasuredNodeRef = useCallback(
    (element: HTMLDivElement | null) => {
      setNodeRef(element)
      measureElement(element)
    },
    [measureElement, setNodeRef],
  )
  const dragHandle = useMemo<BlockDragHandleState>(
    () => ({
      attributes,
      blockId,
      disabled: false,
      dragging: isDragging,
      listeners,
      setActivatorNodeRef,
    }),
    [attributes, blockId, isDragging, listeners, setActivatorNodeRef],
  )
  const style = createSortableBlockStyle(start, transform, transition)

  if (isDragging) {
    style.zIndex = 1
  }

  return (
    <BlockDragHandleProvider value={dragHandle}>
      <div
        className="vetra-virtual-list__item"
        data-block-id={blockId}
        data-index={index}
        data-vetra-dragging={isDragging ? 'true' : 'false'}
        data-vetra-sortable-block={blockId}
        key={blockId}
        ref={setMeasuredNodeRef}
        style={style}
      >
        {children}
      </div>
    </BlockDragHandleProvider>
  )
}

export function resolveTopLevelBlockDragMove(
  input: ResolveTopLevelBlockDragMoveInput,
): MoveBlockCommand | undefined {
  if (typeof input.activeId !== 'string' || typeof input.overId !== 'string') {
    return undefined
  }

  if (input.activeId === input.overId) {
    return undefined
  }

  if (
    !input.sortableBlockIds.includes(input.activeId) ||
    !input.sortableBlockIds.includes(input.overId)
  ) {
    return undefined
  }

  if (!input.topLevelBlockIds.includes(input.activeId)) {
    return undefined
  }

  const toIndex = input.topLevelBlockIds.indexOf(input.overId)
  if (toIndex < 0) {
    return undefined
  }

  return {
    type: 'moveBlock',
    blockId: input.activeId,
    toParentId: input.rootId,
    toIndex,
  }
}

function createSortableBlockStyle(
  start: number,
  sortableTransform: Parameters<typeof CSS.Transform.toString>[0],
  transition: string | undefined,
): CSSProperties {
  const transform = CSS.Transform.toString(sortableTransform)
  const style: CSSProperties = {
    left: 0,
    position: 'absolute',
    top: 0,
    transform:
      transform === undefined
        ? `translateY(${String(start)}px)`
        : `translateY(${String(start)}px) ${transform}`,
    width: '100%',
  }

  if (transition !== undefined) {
    style.transition = transition
  }

  return style
}
