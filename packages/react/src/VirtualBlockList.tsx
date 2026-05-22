import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { BlockId } from '@vetra/core'
import { BlockRenderer } from '@vetra/react/BlockRenderer'
import { SortableBlock, SortableBlockList } from '@vetra/react/drag/SortableBlockList'
import { useDocument } from '@vetra/react/hooks/useDocument'

export interface VirtualBlockListProps {
  readonly blockIds?: readonly BlockId[]
  readonly estimateSize?: number
  readonly overscan?: number
}

export function VirtualBlockList(props: VirtualBlockListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const document = useDocument()
  const blockIds = useMemo(
    () => props.blockIds ?? document.children[document.rootId] ?? [],
    [document.children, document.rootId, props.blockIds],
  )

  const virtualizer = useVirtualizer({
    count: blockIds.length,
    estimateSize: () => props.estimateSize ?? 48,
    getItemKey: (index) => blockIds[index] ?? 'missing-block-id',
    getScrollElement: () => parentRef.current,
    overscan: props.overscan ?? 8,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const sortableBlockIds = virtualItems
    .map((virtualItem) => blockIds[virtualItem.index])
    .filter(isBlockId)
  const dragEnabled = props.blockIds === undefined && sortableBlockIds.length > 1
  const listItems = virtualItems.map((virtualItem) => {
    const blockId = blockIds[virtualItem.index]
    if (blockId === undefined) {
      return null
    }

    const renderer = <BlockRenderer blockId={blockId} />

    if (dragEnabled) {
      return (
        <SortableBlock
          blockId={blockId}
          index={virtualItem.index}
          key={blockId}
          measureElement={virtualizer.measureElement}
          start={virtualItem.start}
        >
          {renderer}
        </SortableBlock>
      )
    }

    return (
      <VirtualBlockListItem
        blockId={blockId}
        index={virtualItem.index}
        key={blockId}
        measureElement={virtualizer.measureElement}
        start={virtualItem.start}
      >
        {renderer}
      </VirtualBlockListItem>
    )
  })

  return (
    <div className="vetra-virtual-list" ref={parentRef}>
      <div
        className="vetra-virtual-list__inner"
        style={{
          height: `${String(virtualizer.getTotalSize())}px`,
          position: 'relative',
        }}
      >
        {dragEnabled ? (
          <SortableBlockList
            blockIds={blockIds}
            rootId={document.rootId}
            sortableBlockIds={sortableBlockIds}
          >
            {listItems}
          </SortableBlockList>
        ) : (
          listItems
        )}
      </div>
    </div>
  )
}

interface VirtualBlockListItemProps {
  readonly blockId: BlockId
  readonly children: ReactNode
  readonly index: number
  readonly measureElement: (element: HTMLDivElement | null) => void
  readonly start: number
}

function VirtualBlockListItem(props: VirtualBlockListItemProps) {
  return (
    <div
      className="vetra-virtual-list__item"
      data-block-id={props.blockId}
      data-index={props.index}
      key={props.blockId}
      ref={props.measureElement}
      style={createVirtualBlockListItemStyle(props.start)}
    >
      {props.children}
    </div>
  )
}

function createVirtualBlockListItemStyle(start: number): CSSProperties {
  return {
    left: 0,
    position: 'absolute',
    top: 0,
    transform: `translateY(${String(start)}px)`,
    width: '100%',
  }
}

function isBlockId(blockId: BlockId | undefined): blockId is BlockId {
  return blockId !== undefined
}
