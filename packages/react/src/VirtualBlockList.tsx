import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { BlockId } from '@vetra/core'
import { BlockRenderer } from '@vetra/react/BlockRenderer'
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

  return (
    <div className="vetra-virtual-list" ref={parentRef}>
      <div
        className="vetra-virtual-list__inner"
        style={{
          height: `${String(virtualizer.getTotalSize())}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const blockId = blockIds[virtualItem.index]
          if (blockId === undefined) {
            return null
          }

          return (
            <div
              className="vetra-virtual-list__item"
              data-index={virtualItem.index}
              data-block-id={blockId}
              key={blockId}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${String(virtualItem.start)}px)`,
              }}
            >
              <BlockRenderer blockId={blockId} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
