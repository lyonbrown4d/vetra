import { memo, useCallback, useRef, type MouseEvent } from 'react'
import { GripVertical, Plus } from 'lucide-react'
import {
  createEmptyInlineContent,
  type BlockId,
  type EditorRuntime,
  type ParagraphBlock,
} from '@vetra/core'
import { useEditor } from '@vetra/react/context/EditorContext'
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
        selection: { type: 'block', blockId: block.id },
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

function focusBlockShellAfterRender(anchor: HTMLElement | null, blockId: BlockId): void {
  const root = anchor?.closest('.vetra-editor-root') ?? anchor?.ownerDocument ?? null

  scheduleAfterRender(() => {
    const blockShell = findBlockShell(root, blockId)
    if (blockShell === undefined) {
      return
    }

    const editor = blockShell.querySelector<HTMLElement>(
      '.vetra-inline-editor[contenteditable="true"]',
    )
    if (editor !== null) {
      editor.focus({ preventScroll: true })
      return
    }

    blockShell.focus()
  })
}

function scheduleAfterRender(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      callback()
    })
    return
  }

  globalThis.setTimeout(callback, 0)
}

function findBlockShell(root: ParentNode | null, blockId: BlockId): HTMLElement | undefined {
  if (root === null) {
    return undefined
  }

  for (const element of root.querySelectorAll<HTMLElement>('[data-vetra-block-shell]')) {
    if (element.dataset.vetraBlockShell === blockId) {
      return element
    }
  }

  return undefined
}
