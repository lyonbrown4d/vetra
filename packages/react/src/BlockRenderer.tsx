import { useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import type { BlockId, DocBlock } from '@vetra/core'
import { BlockControls } from '@vetra/react/blockControls/BlockControls'
import { useEditor } from '@vetra/react/context/EditorContext'
import { useBlockRegistry } from '@vetra/react/EditorProvider'
import { useActiveBlockLifecycle } from '@vetra/react/hooks/useActiveBlockLifecycle'
import { useBlock } from '@vetra/react/hooks/useBlock'
import { useMountedBlockRegistration } from '@vetra/react/hooks/useMountedBlockMetrics'
import { focusBlockShellAfterRender } from '@vetra/react/focus'
import { extendBlockSelectionToBlock } from '@vetra/react/selection/keyboardNavigation'

export interface BlockRendererRootProps {
  readonly blockId: BlockId
}

export function BlockRenderer(props: BlockRendererRootProps) {
  const editor = useEditor()
  const block = useBlock(props.blockId)
  const registry = useBlockRegistry()
  const blockLifecycle = useActiveBlockLifecycle(props.blockId)
  useMountedBlockRegistration(props.blockId)

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) {
        return
      }

      if (isShiftSelectionClick(event)) {
        const focusedBlockId = extendBlockSelectionToBlock(editor, props.blockId)
        if (focusedBlockId !== undefined) {
          event.preventDefault()
          return
        }
      }

      blockLifecycle.selectBlock()
    },
    [blockLifecycle, editor, props.blockId],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      event.preventDefault()
      blockLifecycle.selectBlock()
      focusBlockShellAfterRender(event.currentTarget, props.blockId)
    },
    [blockLifecycle, props.blockId],
  )

  if (block === undefined) {
    return <UnknownBlockFallback blockId={props.blockId} />
  }

  const plugin = registry.find((candidate) => candidate.type === block.type)
  if (plugin === undefined) {
    return <UnknownBlockFallback blockId={props.blockId} block={block} />
  }

  const Renderer =
    blockLifecycle.active && plugin.activeRenderer !== undefined
      ? plugin.activeRenderer
      : plugin.readonlyRenderer

  return (
    <div className="vetra-block-row" data-vetra-block-row={block.id}>
      <BlockControls blockId={block.id} />
      <div
        className="vetra-block-shell"
        data-active={blockLifecycle.active ? 'true' : 'false'}
        data-block-id={block.id}
        data-selected={blockLifecycle.selected ? 'true' : 'false'}
        data-vetra-block-shell={block.id}
        onClick={blockLifecycle.active ? undefined : handleClick}
        onKeyDown={blockLifecycle.active ? undefined : handleKeyDown}
        role={blockLifecycle.active ? undefined : 'button'}
        tabIndex={0}
      >
        <Renderer
          active={blockLifecycle.active}
          block={block}
          editor={editor}
          selected={blockLifecycle.selected}
        />
      </div>
    </div>
  )
}

function isShiftSelectionClick(event: MouseEvent<HTMLDivElement>): boolean {
  return event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
}

export interface UnknownBlockFallbackProps {
  readonly blockId: BlockId
  readonly block?: DocBlock
}

export function UnknownBlockFallback(props: UnknownBlockFallbackProps) {
  return (
    <div className="vetra-block vetra-block--unknown" data-block-id={props.blockId}>
      Unknown block: {props.block?.type ?? props.blockId}
    </div>
  )
}
