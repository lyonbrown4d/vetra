import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  createEditor,
  createEditorState,
  getSelectedBlockIds,
  normalizeSelection,
  type BlockId,
  type DocumentState,
  type EditorRuntime,
} from '@vetra/core'
import { htmlToDocument } from '@vetra/import-html'
import { useEditor } from '@vetra/react/context/EditorContext'
import { EditorProvider } from '@vetra/react/EditorProvider'
import { BlockToolbar } from '@vetra/react/toolbar'
import { SlashMenu } from '@vetra/react/menu'
import {
  createClipboardPayloadFromSelection,
  createDocumentPasteStrategy,
  htmlPasteKind,
  pasteClipboardPayloadIntoEditor,
  pasteIntoEditor,
  VETRA_BLOCK_CLIPBOARD_MIME_TYPE,
} from '@vetra/react/paste'
import {
  collapseSelectionToBlock,
  deleteSelectedBlocks,
  extendBlockSelection,
  moveBlockSelection,
  redoEditorHistory,
  selectAllTopLevelBlocks,
  undoEditorHistory,
} from '@vetra/react/selection'
import { focusBlockShell, focusBlockShellAfterRender, getBlockShell } from '@vetra/react/focus'
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
    previousVersionRef.current = props.initialValue.version

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
  }, [editor, onChange, props.initialValue.version])

  return (
    <EditorProvider blocks={props.blocks} editor={editor}>
      <EditorSurface {...(props.className === undefined ? {} : { className: props.className })} />
    </EditorProvider>
  )
}

interface EditorSurfaceProps {
  readonly className?: string
}

interface SlashMenuState {
  readonly targetBlockId: BlockId
  readonly query: string
  readonly anchorElement?: HTMLElement | null
}

const htmlClipboardMimeType = 'text/html'
const htmlPasteRootId = '__vetra-html-paste-root__'
const htmlPasteStrategy = createDocumentPasteStrategy((input, context) =>
  htmlToDocument(input.text, {
    rootId: htmlPasteRootId,
    generateBlockId: ({ ordinal, sourceTag }) =>
      context.idFactory({ index: ordinal - 1, text: sourceTag, kind: htmlPasteKind }),
  }),
)

function EditorSurface(props: EditorSurfaceProps) {
  const editor = useEditor()
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [slashMenuState, setSlashMenuState] = useState<SlashMenuState | null>(null)
  const slashMenuAnchorElement =
    slashMenuState === null ? null : resolveSlashMenuAnchor(surfaceRef.current, slashMenuState)

  const closeSlashMenu = useCallback(() => {
    setSlashMenuState(null)
  }, [])

  const handlePointerDownCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (slashMenuState === null) {
        return
      }

      const menuElement = surfaceRef.current?.querySelector<HTMLElement>(
        '[data-vetra-slash-menu=""][data-floating]',
      )

      if (menuElement === undefined || menuElement === null || !isNodeTarget(event.target)) {
        return
      }

      if (menuElement.contains(event.target) || menuElement === event.target) {
        return
      }

      if (getBlockShell(surfaceRef.current, slashMenuState.targetBlockId)?.contains(event.target)) {
        return
      }

      closeSlashMenu()
    },
    [closeSlashMenu, slashMenuState],
  )

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        !isComposingKeyEvent(event) &&
        slashMenuState === null &&
        isSelectAllBlocksShortcut(event) &&
        !isTextInputElement(event.target) &&
        (!isLexicalActiveEditorTarget(event.target) || hasMultipleTopLevelBlocks(editor))
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
          const blockShell = getBlockShell(surfaceRef.current, activeBlockId)
          const anchorElement = resolveSlashMenuTargetAnchor(blockShell, event.target)

          setSlashMenuState({
            anchorElement,
            targetBlockId: activeBlockId,
            query: '',
          })
        }

        return
      }

      if (isTextEditingElement(event.target)) {
        return
      }

      if (event.shiftKey && !hasNonShiftKeyboardNavigationModifier(event)) {
        if (event.key === 'ArrowUp') {
          const blockId = extendBlockSelection(editor, 'previous')
          if (blockId !== undefined) {
            event.preventDefault()
            focusBlockShell(surfaceRef.current, blockId)
          }

          return
        }

        if (event.key === 'ArrowDown') {
          const blockId = extendBlockSelection(editor, 'next')
          if (blockId !== undefined) {
            event.preventDefault()
            focusBlockShell(surfaceRef.current, blockId)
          }

          return
        }
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
      if (activeBlockId === undefined || isLexicalActiveEditorTarget(event.target)) {
        return
      }

      const pasteTarget = createPasteTarget(editor, activeBlockId)
      const clipboardText = event.clipboardData.getData('text/plain')
      const clipboardHtml = event.clipboardData.getData(htmlClipboardMimeType)
      const customPayload = event.clipboardData.getData(VETRA_BLOCK_CLIPBOARD_MIME_TYPE)
      if (customPayload.length > 0) {
        const result = pasteClipboardPayloadIntoEditor({
          editor,
          target: pasteTarget,
          payload: customPayload,
          idFactory: ({ index }) => createAvailableBlockId(editor, `paste-${String(index + 1)}`),
        })
        if (result.ok) {
          event.preventDefault()
          focusAfterPaste(editor, result, surfaceRef.current)
          return
        }
      }

      if (clipboardHtml.length > 0) {
        const result = pasteIntoEditor({
          editor,
          target: pasteTarget,
          input: { text: clipboardHtml, kind: htmlPasteKind },
          idFactory: ({ index }) => createAvailableBlockId(editor, `paste-${String(index + 1)}`),
          strategy: htmlPasteStrategy,
        })
        if (result.ok && result.value.handled) {
          event.preventDefault()
          focusAfterPaste(editor, result, surfaceRef.current)
          return
        }
      }

      if (clipboardText.length === 0) {
        return
      }

      const result = pasteIntoEditor({
        editor,
        target: pasteTarget,
        input: { text: clipboardText },
        idFactory: ({ index }) => createAvailableBlockId(editor, `paste-${String(index + 1)}`),
      })

      if (result.ok) {
        event.preventDefault()
        focusAfterPaste(editor, result, surfaceRef.current)
      }
    },
    [editor],
  )

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (isLexicalActiveEditorTarget(event.target)) {
        return
      }

      const state = editor.getState()
      const selectedBlockIds = getSelectedBlockIds(
        state.document,
        normalizeSelection(state.document, state.selection),
      )
      if (selectedBlockIds.length === 0) {
        return
      }

      event.preventDefault()

      const payload = createClipboardPayloadFromSelection(state.document, state.selection)
      event.clipboardData.setData(VETRA_BLOCK_CLIPBOARD_MIME_TYPE, payload.json)
      event.clipboardData.setData('text/plain', payload.plainText)
    },
    [editor],
  )

  const handleCut = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (isLexicalActiveEditorTarget(event.target)) {
        return
      }

      const state = editor.getState()
      const selectedBlockIds = getSelectedBlockIds(
        state.document,
        normalizeSelection(state.document, state.selection),
      )
      if (selectedBlockIds.length === 0) {
        return
      }

      const payload = createClipboardPayloadFromSelection(state.document, state.selection)
      event.clipboardData.setData(VETRA_BLOCK_CLIPBOARD_MIME_TYPE, payload.json)
      event.clipboardData.setData('text/plain', payload.plainText)

      const deleteResult = deleteSelectedBlocks(editor)
      if (deleteResult !== undefined) {
        event.preventDefault()
        if (deleteResult.nextBlockId !== undefined) {
          focusBlockShell(surfaceRef.current, deleteResult.nextBlockId)
        }
      }
    },
    [editor],
  )

  return (
    <div
      className={createEditorRootClassName(props.className)}
      onPointerDownCapture={handlePointerDownCapture}
      onKeyDown={handleKeyDown}
      onKeyDownCapture={handleKeyDownCapture}
      onCopy={handleCopy}
      onCut={handleCut}
      onPaste={handlePaste}
      ref={surfaceRef}
    >
      <BlockToolbar className="vetra-block-toolbar" />
      {slashMenuState === null ? null : (
        <SlashMenu
          anchorElement={slashMenuAnchorElement}
          autoFocus
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

function createEditorRootClassName(className: string | undefined): string {
  return className === undefined ? 'vetra-editor-root' : `vetra-editor-root ${className}`
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

function createPasteTarget(
  editor: EditorRuntime,
  fallbackReferenceBlockId: BlockId,
): {
  readonly referenceBlockId: BlockId
  readonly placement?: 'before'
  readonly replaceBlockIds?: readonly BlockId[]
} {
  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)

  if (selection.type !== 'range-block') {
    return { referenceBlockId: fallbackReferenceBlockId }
  }

  const selectedBlockIds = getSelectedBlockIds(state.document, selection)
  const firstSelectedBlockId = selectedBlockIds[0]
  if (firstSelectedBlockId === undefined) {
    return { referenceBlockId: fallbackReferenceBlockId }
  }

  return {
    referenceBlockId: firstSelectedBlockId,
    placement: 'before',
    replaceBlockIds: selectedBlockIds,
  }
}

let fallbackBlockIdSeed = 0

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

function isPrintableQueryKey(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
}

function isTextInputElement(target: EventTarget): boolean {
  return target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
}

function isLexicalActiveEditorTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('.vetra-inline-editor[contenteditable="true"]') !== null
  )
}

function hasKeyboardNavigationModifier(event: KeyboardEvent<HTMLElement>): boolean {
  return hasNonShiftKeyboardNavigationModifier(event) || event.shiftKey
}

function hasNonShiftKeyboardNavigationModifier(event: KeyboardEvent<HTMLElement>): boolean {
  return event.altKey || event.ctrlKey || event.metaKey
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

function hasMultipleTopLevelBlocks(editor: EditorRuntime): boolean {
  const state = editor.getState()
  const rootBlocks = state.document.children[state.document.rootId] ?? []

  return rootBlocks.length > 1
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

function isNodeTarget(target: EventTarget): target is Node {
  return target instanceof Node
}

function resolveSlashMenuTargetAnchor(
  blockShell: HTMLElement | undefined,
  target: EventTarget,
): HTMLElement | null {
  if (target instanceof HTMLElement) {
    const inlineTarget = target.closest('.vetra-inline-editor[contenteditable="true"]')
    if (inlineTarget !== null && inlineTarget instanceof HTMLElement) {
      return inlineTarget
    }
  }

  if (blockShell !== undefined) {
    const inlineTarget = blockShell.querySelector<HTMLElement>(
      '.vetra-inline-editor[contenteditable="true"]',
    )
    if (inlineTarget !== null) {
      return inlineTarget
    }

    return blockShell
  }

  return null
}

function resolveSlashMenuAnchor(
  root: HTMLElement | null,
  state: SlashMenuState,
): HTMLElement | null {
  if (state.anchorElement?.isConnected === true) {
    return state.anchorElement
  }

  return getBlockShell(root, state.targetBlockId) ?? root
}

function focusAfterPaste(
  editor: EditorRuntime,
  result: { readonly value: { readonly insertedBlockIds: readonly BlockId[] } },
  root: HTMLElement | null,
): void {
  const lastInsertedBlockId = result.value.insertedBlockIds.at(-1)
  if (lastInsertedBlockId !== undefined) {
    editor.dispatch({
      type: 'setSelection',
      selection: { type: 'block', blockId: lastInsertedBlockId },
    })
    if (root !== null) {
      focusBlockShellAfterRender(root, lastInsertedBlockId)
    }
  }
}
