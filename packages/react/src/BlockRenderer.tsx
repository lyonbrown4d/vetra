import { useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { getInlineContentTextLength } from '@vetra/core'
import type { BlockId, DocBlock, DocumentSelection, InlineContent } from '@vetra/core'
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

      const selection = createPointerTextSelection(event, block)
      if (selection !== undefined) {
        const result = editor.dispatch({
          type: 'setSelection',
          selection,
        })
        if (result.ok) {
          return
        }
      }

      blockLifecycle.selectBlock()
    },
    [block, blockLifecycle, editor, props.blockId],
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

function createPointerTextSelection(
  event: MouseEvent<HTMLDivElement>,
  block: DocBlock | undefined,
): DocumentSelection | undefined {
  if (block === undefined || !isInlineContent(block.content)) {
    return undefined
  }

  const textOffset = readTextOffsetFromPoint(event.currentTarget, event.clientX, event.clientY)
  if (textOffset === undefined) {
    return undefined
  }

  const textLength = getInlineContentTextLength(block.content)
  const point = {
    path: [],
    offset: clampNumber(textOffset, 0, textLength),
  }

  return {
    type: 'text',
    blockId: block.id,
    anchor: point,
    focus: point,
  }
}

function readTextOffsetFromPoint(root: HTMLElement, x: number, y: number): number | undefined {
  const caretPoint = readCaretPointFromCoordinates(root.ownerDocument, x, y)
  if (caretPoint === undefined || !root.contains(caretPoint.node)) {
    return undefined
  }

  return readTextOffsetBeforeDomPoint(root, caretPoint.node, caretPoint.offset)
}

interface CaretPoint {
  readonly node: Node
  readonly offset: number
}

function readCaretPointFromCoordinates(
  document: Document,
  x: number,
  y: number,
): CaretPoint | undefined {
  const caretPositionFromPoint = Reflect.get(document, 'caretPositionFromPoint')
  if (typeof caretPositionFromPoint === 'function') {
    const caretPosition = (caretPositionFromPoint as CaretPositionFromPoint).call(document, x, y)

    if (isCaretPositionLike(caretPosition)) {
      return {
        node: caretPosition.offsetNode,
        offset: caretPosition.offset,
      }
    }
  }

  const caretRangeFromPoint = Reflect.get(document, 'caretRangeFromPoint')
  if (typeof caretRangeFromPoint !== 'function') {
    return undefined
  }

  const caretRange = caretRangeFromPoint.call(document, x, y)
  if (caretRange instanceof Range) {
    return {
      node: caretRange.startContainer,
      offset: caretRange.startOffset,
    }
  }

  return undefined
}

type CaretPositionFromPoint = (this: Document, x: number, y: number) => CaretPositionLike | null

interface CaretPositionLike {
  readonly offsetNode: Node
  readonly offset: number
}

function isCaretPositionLike(value: unknown): value is CaretPositionLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'offsetNode' in value &&
    value.offsetNode instanceof Node &&
    'offset' in value &&
    typeof value.offset === 'number'
  )
}

function readTextOffsetBeforeDomPoint(
  root: HTMLElement,
  node: Node,
  offset: number,
): number | undefined {
  const range = root.ownerDocument.createRange()

  try {
    range.selectNodeContents(root)
    range.setEnd(node, offset)
  } catch {
    return undefined
  }

  return range.toString().length
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
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
