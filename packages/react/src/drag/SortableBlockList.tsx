import { useCallback, useMemo, type CSSProperties, type ReactNode, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragOverEvent,
  type DragEndEvent,
  useSensor,
  useSensors,
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
import {
  BlockDropTargetProvider,
  useBlockDropTarget,
} from '@vetra/react/drag/BlockDropTargetContext'

const TAIL_DROP_TARGET_ID = '__vetra-tail__'

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
  readonly isLast: boolean
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

interface BlockDragStateContextValue {
  readonly overBlockId: BlockId | undefined
  readonly overTail: boolean
}

export function SortableBlockList(props: SortableBlockListProps) {
  const editor = useEditor()
  const sortableItems = useMemo(() => [...props.sortableBlockIds], [props.sortableBlockIds])
  const [overBlockId, setOverBlockId] = useState<BlockId | undefined>(undefined)
  const [overTail, setOverTail] = useState(false)
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
      setOverBlockId(undefined)
      setOverTail(false)
      const resolvedOverId = resolveTopLevelDragOverTarget(
        event.over?.id,
        event.active.id,
        props.sortableBlockIds,
        props.blockIds,
        event.delta.y > 0,
      )

      const command = resolveTopLevelBlockDragMove({
        activeId: event.active.id,
        overId: resolvedOverId.overTail ? TAIL_DROP_TARGET_ID : (resolvedOverId.blockId ?? null),
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

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const isMovingDown = event.delta.y > 0
      const resolvedOverId = resolveTopLevelDragOverTarget(
        event.over?.id,
        event.active.id,
        props.sortableBlockIds,
        props.blockIds,
        isMovingDown,
      )
      setOverBlockId(resolvedOverId.blockId)
      setOverTail(resolvedOverId.overTail)
    },
    [props.blockIds, props.sortableBlockIds],
  )

  const blockDropTargetValue = useMemo<BlockDragStateContextValue>(
    () => ({ overBlockId, overTail }),
    [overBlockId, overTail],
  )

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragCancel={() => {
        setOverBlockId(undefined)
        setOverTail(false)
      }}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
        <BlockDropTargetProvider value={blockDropTargetValue}>
          {props.children}
        </BlockDropTargetProvider>
      </SortableContext>
    </DndContext>
  )
}

export function SortableBlock(props: SortableBlockProps) {
  const { blockId, children, index, isLast, measureElement, start } = props
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
  const dragState = useBlockDropTarget()
  const virtualItemStyle = createVirtualSortableBlockItemStyle(start)
  const sortableStyle = createSortableBlockStyle(transform, transition)
  const isDropTarget = dragState.overBlockId === blockId
  const isTailDropTarget = dragState.overTail && isLast

  if (isDragging) {
    sortableStyle.zIndex = 1
  }

  return (
    <BlockDragHandleProvider value={dragHandle}>
      <div
        className="vetra-virtual-list__item"
        data-block-id={blockId}
        data-index={index}
        data-vetra-drag-over={isDropTarget ? 'true' : 'false'}
        data-vetra-drag-tail-over={isTailDropTarget ? 'true' : 'false'}
        data-vetra-dragging={isDragging ? 'true' : 'false'}
        data-vetra-sortable-block={blockId}
        key={blockId}
        ref={measureElement}
        style={virtualItemStyle}
      >
        <div
          className="vetra-sortable-block"
          data-vetra-sortable-drag-layer={blockId}
          data-vetra-dragging={isDragging ? 'true' : 'false'}
          ref={setNodeRef}
          style={sortableStyle}
        >
          {children}
        </div>
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

  if (!input.sortableBlockIds.includes(input.activeId)) {
    return undefined
  }

  if (!input.topLevelBlockIds.includes(input.activeId)) {
    return undefined
  }

  if (input.overId === TAIL_DROP_TARGET_ID) {
    return {
      type: 'moveBlock',
      blockId: input.activeId,
      toParentId: input.rootId,
      toIndex: input.topLevelBlockIds.length,
    }
  }

  if (!input.sortableBlockIds.includes(input.overId)) {
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

interface ResolvedTopLevelDragOverTarget {
  readonly blockId?: BlockId
  readonly overTail: boolean
}

function resolveTopLevelDragOverTarget(
  overId: UniqueIdentifier | undefined,
  activeId: UniqueIdentifier,
  sortableBlockIds: readonly BlockId[],
  topLevelBlockIds: readonly BlockId[],
  isMovingDown: boolean,
): ResolvedTopLevelDragOverTarget {
  if (typeof overId !== 'string' || typeof activeId !== 'string') {
    return { overTail: false }
  }

  const lastBlockId = topLevelBlockIds.at(-1)
  if (isMovingDown && overId !== activeId && overId === lastBlockId) {
    return { overTail: true }
  }

  if (sortableBlockIds.includes(overId)) {
    return { blockId: overId, overTail: false }
  }

  return { overTail: false }
}

function createVirtualSortableBlockItemStyle(start: number): CSSProperties {
  return {
    left: 0,
    position: 'absolute',
    top: 0,
    transform: `translateY(${String(start)}px)`,
    width: '100%',
  }
}

function createSortableBlockStyle(
  sortableTransform: Parameters<typeof CSS.Transform.toString>[0],
  transition: string | undefined,
): CSSProperties {
  const transform = CSS.Transform.toString(sortableTransform)
  const style: CSSProperties = {
    position: 'relative',
    transform,
    width: '100%',
  }

  if (transition !== undefined) {
    style.transition = transition
  }

  return style
}
