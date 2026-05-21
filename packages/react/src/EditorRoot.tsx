import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import {
  createEditor,
  createEditorState,
  normalizeSelection,
  type BlockId,
  type DocumentState,
  type EditorRuntime,
} from '@vetra/core'
import { useEditor } from '@vetra/react/context/EditorContext'
import { EditorProvider } from '@vetra/react/EditorProvider'
import { BlockToolbar } from '@vetra/react/toolbar'
import { SlashMenu } from '@vetra/react/menu'
import { pasteIntoEditor } from '@vetra/react/paste'
import {
  collapseSelectionToBlock,
  deleteSelectedBlocks,
  moveBlockSelection,
  redoEditorHistory,
  selectAllTopLevelBlocks,
  undoEditorHistory,
} from '@vetra/react/selection'
import { VirtualBlockList } from '@vetra/react/VirtualBlockList'
import type { AnyReactBlockPlugin } from '@vetra/react/renderer/types'

export interface EditorRootProps {
  readonly initialValue: DocumentState
  readonly blocks: readonly AnyReactBlockPlugin[]
  readonly className?: string
  readonly onChange?: (nextDocument: DocumentState) => void
}

export function EditorRoot(props: EditorRootProps) {
  const { onChange } = props
  const editor = useMemo<EditorRuntime>(
    () => createEditor(createEditorState(props.initialValue)),
    [props.initialValue],
  )
  const previousVersionRef = useRef(props.initialValue.version)

  useEffect(() => {
    if (onChange === undefined) {
      return undefined
    }

    return editor.subscribe(() => {
      const nextDocument = editor.getState().document
      if (nextDocument.version === previousVersionRef.current) {
        return
      }

      previousVersionRef.current = nextDocument.version
      onChange(nextDocument)
    })
  }, [editor, onChange])

  return (
    <EditorProvider blocks={props.blocks} editor={editor}>
      <EditorSurface {...(props.className === undefined ? {} : { className: props.className })} />
    </EditorProvider>
  )
}

interface EditorSurfaceProps {
  readonly className?: string
}

function EditorSurface(props: EditorSurfaceProps) {
  const editor = useEditor()
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [slashMenuState, setSlashMenuState] = useState<{
    readonly targetBlockId: BlockId
    readonly query: string
  } | null>(null)

  const closeSlashMenu = useCallback(() => {
    setSlashMenuState(null)
  }, [])

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        !isComposingKeyEvent(event) &&
        slashMenuState === null &&
        isSelectAllBlocksShortcut(event) &&
        !isTextInputElement(event.target)
      ) {
        event.preventDefault()
        event.stopPropagation()

        const firstBlockId = selectAllTopLevelBlocks(editor)
        if (firstBlockId !== undefined) {
          focusBlockShell(surfaceRef.current, firstBlockId)
        }
      }
    },
    [editor, slashMenuState],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (isComposingKeyEvent(event)) {
        return
      }

      if (slashMenuState !== null) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeSlashMenu()
          return
        }

        if (event.key === 'Backspace') {
          event.preventDefault()
          setSlashMenuState((current) =>
            current === null
              ? null
              : {
                  ...current,
                  query: current.query.slice(0, -1),
                },
          )
          return
        }

        if (isPrintableQueryKey(event)) {
          event.preventDefault()
          setSlashMenuState((current) =>
            current === null
              ? null
              : {
                  ...current,
                  query: `${current.query}${event.key}`,
                },
          )
        }

        return
      }

      if (isUndoShortcut(event)) {
        if (undoEditorHistory(editor)) {
          event.preventDefault()
        }

        return
      }

      if (isRedoShortcut(event)) {
        if (redoEditorHistory(editor)) {
          event.preventDefault()
        }

        return
      }

      if (isSelectAllBlocksShortcut(event)) {
        if (isTextInputElement(event.target)) {
          return
        }

        event.preventDefault()

        const firstBlockId = selectAllTopLevelBlocks(editor)
        if (firstBlockId !== undefined) {
          focusBlockShell(surfaceRef.current, firstBlockId)
        }

        return
      }

      if (event.key === 'Escape') {
        const blockId = collapseSelectionToBlock(editor)
        if (blockId !== undefined) {
          event.preventDefault()
          focusBlockShell(surfaceRef.current, blockId)
        }

        return
      }

      if (event.key === '/' && !hasSlashMenuModifier(event) && !isTextInputElement(event.target)) {
        const activeBlockId = getActiveBlockId(editor)
        if (activeBlockId !== undefined) {
          event.preventDefault()
          setSlashMenuState({
            targetBlockId: activeBlockId,
            query: '',
          })
        }

        return
      }

      if (isTextEditingElement(event.target)) {
        return
      }

      if (!hasKeyboardNavigationModifier(event)) {
        if (event.key === 'ArrowUp') {
          const blockId = moveBlockSelection(editor, 'previous')
          if (blockId !== undefined) {
            event.preventDefault()
            focusBlockShell(surfaceRef.current, blockId)
          }

          return
        }

        if (event.key === 'ArrowDown') {
          const blockId = moveBlockSelection(editor, 'next')
          if (blockId !== undefined) {
            event.preventDefault()
            focusBlockShell(surfaceRef.current, blockId)
          }

          return
        }
      }

      if (event.key === 'Delete' && !hasKeyboardNavigationModifier(event)) {
        const result = deleteSelectedBlocks(editor)
        if (result !== undefined) {
          event.preventDefault()
          if (result.nextBlockId !== undefined) {
            focusBlockShell(surfaceRef.current, result.nextBlockId)
          }
        }

        return
      }
    },
    [closeSlashMenu, editor, slashMenuState],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const activeBlockId = getActiveBlockId(editor)
      const text = event.clipboardData.getData('text/plain')
      if (activeBlockId === undefined || text.length === 0) {
        return
      }

      event.preventDefault()

      const result = pasteIntoEditor({
        editor,
        target: { referenceBlockId: activeBlockId },
        input: { text },
        idFactory: ({ index }) => createAvailableBlockId(editor, `paste-${String(index + 1)}`),
      })

      if (result.ok) {
        const lastInsertedBlockId = result.value.insertedBlockIds.at(-1)
        if (lastInsertedBlockId !== undefined) {
          editor.dispatch({
            type: 'setSelection',
            selection: { type: 'block', blockId: lastInsertedBlockId },
          })
        }
      }
    },
    [editor],
  )

  return (
    <div
      className={props.className ?? 'vetra-editor-root'}
      onKeyDown={handleKeyDown}
      onKeyDownCapture={handleKeyDownCapture}
      onPaste={handlePaste}
      ref={surfaceRef}
    >
      <BlockToolbar className="vetra-block-toolbar" />
      {slashMenuState === null ? null : (
        <SlashMenu
          className="vetra-slash-menu"
          idFactory={() => createAvailableBlockId(editor, 'slash')}
          mode="insert-after"
          onClose={closeSlashMenu}
          query={slashMenuState.query}
          targetBlockId={slashMenuState.targetBlockId}
        />
      )}
      <VirtualBlockList />
    </div>
  )
}

function getActiveBlockId(editor: EditorRuntime): BlockId | undefined {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)

  switch (selection.type) {
    case 'none':
      return undefined
    case 'block':
    case 'text':
      return selection.blockId
    case 'range-block':
      return selection.focusBlockId
  }
}

function createAvailableBlockId(editor: EditorRuntime, prefix: string): BlockId {
  let candidate = `${prefix}-${globalThis.crypto.randomUUID()}`

  while (editor.getState().document.blocks[candidate] !== undefined) {
    candidate = `${prefix}-${globalThis.crypto.randomUUID()}`
  }

  return candidate
}

function isPrintableQueryKey(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
}

function isTextInputElement(target: EventTarget): boolean {
  return target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
}

function hasKeyboardNavigationModifier(event: KeyboardEvent<HTMLElement>): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
}

function hasSlashMenuModifier(event: KeyboardEvent<HTMLElement>): boolean {
  return event.altKey || event.ctrlKey || event.metaKey
}

function hasPrimaryShortcutModifier(event: KeyboardEvent<HTMLElement>): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey
}

function isUndoShortcut(event: KeyboardEvent<HTMLElement>): boolean {
  return hasPrimaryShortcutModifier(event) && !event.shiftKey && event.key.toLowerCase() === 'z'
}

function isRedoShortcut(event: KeyboardEvent<HTMLElement>): boolean {
  if (!hasPrimaryShortcutModifier(event)) {
    return false
  }

  const key = event.key.toLowerCase()

  return (event.shiftKey && key === 'z') || (!event.shiftKey && key === 'y')
}

function isSelectAllBlocksShortcut(event: KeyboardEvent<HTMLElement>): boolean {
  return hasPrimaryShortcutModifier(event) && !event.shiftKey && event.key.toLowerCase() === 'a'
}

function isComposingKeyEvent(event: KeyboardEvent<HTMLElement>): boolean {
  return event.nativeEvent.isComposing || event.key === 'Process'
}

function isTextEditingElement(target: EventTarget): boolean {
  if (isTextInputElement(target)) {
    return true
  }

  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('[contenteditable="true"]') !== null)
  )
}

function focusBlockShell(root: HTMLElement | null, blockId: BlockId): void {
  if (root === null) {
    return
  }

  for (const element of root.querySelectorAll<HTMLElement>('[data-vetra-block-shell]')) {
    if (element.dataset.vetraBlockShell === blockId) {
      element.focus()
      return
    }
  }
}
