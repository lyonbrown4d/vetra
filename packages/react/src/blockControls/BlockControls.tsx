import { memo, useCallback, useRef, type MouseEvent } from 'react'
import { GripVertical, Plus } from 'lucide-react'
import {
  createEmptyInlineContent,
  type BlockId,
  type DocumentSelection,
  type EditorRuntime,
  type ParagraphBlock,
} from '@vetra/core'
import { useEditor } from '@vetra/react/context/EditorContext'
import { focusBlockShellAfterRender } from '@vetra/react/focus'
import { useBlockDragHandle } from '@vetra/react/drag/BlockDragHandleContext'

export interface BlockControlsProps {
  readonly blockId: BlockId
}

let fallbackBlockIdSeed = 0

export const BlockControls = memo(function BlockControls(props: BlockControlsProps) {
  const editor = useEditor()
  const dragHandle = useBlockDragHandle()
  const dragListeners = dragHandle.listeners ?? {}
  const insertButtonRef = useRef<HTMLButtonElement | null>(null)

  const handleInsertAfter = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      // Keep the gutter independent from EditorRoot slash-menu state: plus inserts a paragraph.
      const block = createEmptyParagraphBlock(editor)
      const insertResult = editor.dispatch({
        type: 'insertBlockAfter',
        referenceBlockId: props.blockId,
        block,
      })

      if (!insertResult.ok) {
        return
      }

      const selectionResult = editor.dispatch({
        type: 'setSelection',
        selection: createCollapsedTextSelection(block.id, 0),
      })

      if (selectionResult.ok) {
        focusBlockShellAfterRender(insertButtonRef.current, block.id)
      }
    },
    [editor, props.blockId],
  )

  const stopControlEvent = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])
  const stopDragClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }, [])

  return (
    <div className="vetra-block-controls" data-vetra-block-controls={props.blockId}>
      <button
        aria-label="Insert paragraph after block"
        className="vetra-block-controls__button"
        data-vetra-block-control="insert-after"
        data-vetra-block-control-block-id={props.blockId}
        onClick={handleInsertAfter}
        onMouseDown={stopControlEvent}
        ref={insertButtonRef}
        title="Insert paragraph after block"
        type="button"
      >
        <Plus aria-hidden="true" size={16} strokeWidth={2} />
      </button>
      <button
        {...dragHandle.attributes}
        {...dragListeners}
        aria-disabled={dragHandle.disabled ? 'true' : 'false'}
        aria-label="Drag block"
        className="vetra-block-controls__button vetra-block-controls__button--drag"
        data-vetra-block-drag-handle={dragHandle.blockId ?? props.blockId}
        data-vetra-block-drag-handle-disabled={dragHandle.disabled ? 'true' : 'false'}
        disabled={dragHandle.disabled}
        onClick={stopDragClick}
        ref={dragHandle.setActivatorNodeRef}
        title="Drag block"
        type="button"
      >
        <GripVertical aria-hidden="true" size={16} strokeWidth={2} />
      </button>
    </div>
  )
})

function createEmptyParagraphBlock(editor: EditorRuntime): ParagraphBlock {
  return {
    id: createAvailableBlockId(editor, 'gutter-paragraph'),
    type: 'paragraph',
    content: createEmptyInlineContent(),
  }
}

function createCollapsedTextSelection(blockId: BlockId, offset: number): DocumentSelection {
  const point = { path: [], offset }

  return {
    type: 'text',
    blockId,
    anchor: point,
    focus: point,
  }
}

function createAvailableBlockId(editor: EditorRuntime, prefix: string): BlockId {
  let candidate = `${prefix}-${createBlockIdSuffix()}`

  while (editor.getState().document.blocks[candidate] !== undefined) {
    candidate = `${prefix}-${createBlockIdSuffix()}`
  }

  return candidate
}

function createBlockIdSuffix(): string {
  const browserCrypto = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto

  if (typeof browserCrypto?.randomUUID === 'function') {
    return browserCrypto.randomUUID()
  }

  fallbackBlockIdSeed += 1
  return `local-${Date.now().toString(36)}-${String(fallbackBlockIdSeed)}`
}
