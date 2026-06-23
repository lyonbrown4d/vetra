import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
  type FocusEvent,
} from 'react'
import {
  createEditor,
  createEditorState,
  getSelectionReferencedBlockIds,
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

interface InlineToolbarPosition {
  readonly left: number
  readonly top: number
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
  const [inlineToolbarPosition, setInlineToolbarPosition] = useState<InlineToolbarPosition | null>(
    null,
  )
  const slashMenuAnchorElement =
    slashMenuState === null ? null : resolveSlashMenuAnchor(surfaceRef.current, slashMenuState)
  const inlineToolbarStyle = createInlineToolbarStyle(inlineToolbarPosition)

  const updateInlineToolbarPosition = useCallback(() => {
    setInlineToolbarPosition(resolveInlineToolbarPosition(editor, surfaceRef.current))
  }, [editor])

  useEffect(() => {
    const ownerDocument = surfaceRef.current?.ownerDocument ?? globalThis.document
    ownerDocument.addEventListener('selectionchange', updateInlineToolbarPosition)
    ownerDocument.addEventListener('scroll', updateInlineToolbarPosition, true)
    ownerDocument.defaultView?.addEventListener('resize', updateInlineToolbarPosition)

    return () => {
      ownerDocument.removeEventListener('selectionchange', updateInlineToolbarPosition)
      ownerDocument.removeEventListener('scroll', updateInlineToolbarPosition, true)
      ownerDocument.defaultView?.removeEventListener('resize', updateInlineToolbarPosition)
    }
  }, [updateInlineToolbarPosition])

  const closeSlashMenu = useCallback(() => {
    setSlashMenuState(null)
  }, [])

  const handlePointerDownCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (slashMenuState === null) {
        if (!isInlineEditorTarget(event.target)) {
          setInlineToolbarPosition(null)
        }

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
        shouldHandleSelectAllBlocksShortcut(event.target)
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
        if (shouldDeferShellKeyHandling(event.target) && !isSlashMenuTarget(event.target)) {
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          closeSlashMenu()
          return
        }

        if (event.key === 'Backspace') {
          event.preventDefault()
          setSlashMenuState((current) =>
            current === null || current.query.length === 0
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

      if (isSelectAllBlocksShortcut(event)) {
        if (!shouldHandleSelectAllBlocksShortcut(event.target)) {
          return
        }

        event.preventDefault()

        const firstBlockId = selectAllTopLevelBlocks(editor)
        if (firstBlockId !== undefined) {
          focusBlockShell(surfaceRef.current, firstBlockId)
        }

        return
      }

      if (event.key === '/' && !hasSlashMenuModifier(event) && shouldOpenSlashMenu(event.target)) {
        const activeBlockId = getActiveBlockId(editor)
        if (activeBlockId !== undefined) {
          event.preventDefault()
          const blockShell = getBlockShell(surfaceRef.current, activeBlockId)
          const anchorElement = resolveSlashMenuTargetAnchor(
            blockShell,
            event.target,
            surfaceRef.current,
          )

          setSlashMenuState({
            anchorElement,
            targetBlockId: activeBlockId,
            query: '',
          })
        }

        return
      }

      if (shouldDeferShellKeyHandling(event.target)) {
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

      if (event.key === 'Escape') {
        const blockId = collapseSelectionToBlock(editor)
        if (blockId !== undefined) {
          event.preventDefault()
          focusBlockShell(surfaceRef.current, blockId)
        }

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

  const handleFocusOut = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget

    if (nextFocusedElement === null || !event.currentTarget.contains(nextFocusedElement)) {
      setInlineToolbarPosition(null)
    }
  }, [])
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const activeBlockId = getActiveBlockId(editor)
      if (activeBlockId === undefined || isTextEditingElement(event.target)) {
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
      if (isTextEditingElement(event.target)) {
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
      if (isTextEditingElement(event.target)) {
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
      onPointerUp={updateInlineToolbarPosition}
      onKeyDown={handleKeyDown}
      onKeyDownCapture={handleKeyDownCapture}
      onKeyUp={updateInlineToolbarPosition}
      onCopy={handleCopy}
      onCut={handleCut}
      onPaste={handlePaste}
      onBlurCapture={handleFocusOut}
      ref={surfaceRef}
    >
      <BlockToolbar
        className="vetra-block-toolbar"
        visible={inlineToolbarPosition !== null}
        {...(inlineToolbarStyle === undefined ? {} : { style: inlineToolbarStyle })}
      />
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

function createInlineToolbarStyle(
  position: InlineToolbarPosition | null,
): CSSProperties | undefined {
  if (position === null) {
    return undefined
  }

  return {
    left: position.left,
    opacity: 1,
    position: 'fixed',
    right: 'auto',
    top: position.top,
    transform: 'translate(-50%, calc(-100% - 8px))',
  }
}

function resolveInlineToolbarPosition(
  editor: EditorRuntime,
  root: HTMLElement | null,
): InlineToolbarPosition | null {
  if (root === null) {
    return null
  }

  const state = editor.getState()
  const selection = normalizeSelection(state.document, state.selection)
  const referencedBlockIds = getSelectionReferencedBlockIds(selection)

  const ownerDocument = root.ownerDocument
  const domSelection = ownerDocument.getSelection()

  if (
    domSelection === null ||
    domSelection.isCollapsed ||
    domSelection.rangeCount === 0 ||
    domSelection.toString().trim().length === 0
  ) {
    return null
  }

  const inlineEditor = resolveInlineEditorSelectionTarget(root, domSelection)
  if (inlineEditor === null) {
    return null
  }

  const inlineEditorBlockId = inlineEditor
    .closest('[data-vetra-block-shell]')
    ?.getAttribute('data-vetra-block-shell')
  if (inlineEditorBlockId === null || inlineEditorBlockId === undefined) {
    return null
  }

  if (referencedBlockIds.length > 0 && !referencedBlockIds.includes(inlineEditorBlockId)) {
    return null
  }

  const rect = readSelectionRect(domSelection.getRangeAt(0), inlineEditor)
  if (rect === null) {
    return null
  }

  const viewportWidth = root.ownerDocument.defaultView?.innerWidth ?? rect.left + rect.width
  const left = clampNumber(rect.left + rect.width / 2, 24, Math.max(24, viewportWidth - 24))

  return {
    left,
    top: Math.max(8, rect.top),
  }
}

function resolveInlineEditorSelectionTarget(
  root: HTMLElement,
  selection: Selection,
): HTMLElement | null {
  const anchorElement = getSelectionElement(selection.anchorNode)
  const focusElement = getSelectionElement(selection.focusNode)
  const anchorInlineEditor = anchorElement?.closest<HTMLElement>(
    '.vetra-inline-editor[contenteditable="true"]',
  )
  const focusInlineEditor = focusElement?.closest<HTMLElement>(
    '.vetra-inline-editor[contenteditable="true"]',
  )

  if (
    anchorInlineEditor === null ||
    anchorInlineEditor === undefined ||
    focusInlineEditor !== anchorInlineEditor ||
    !root.contains(anchorInlineEditor)
  ) {
    return null
  }

  return anchorInlineEditor
}

function getSelectionElement(node: Node | null): HTMLElement | null {
  if (node instanceof HTMLElement) {
    return node
  }

  return node?.parentElement ?? null
}

interface SelectionRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function readSelectionRect(range: Range, fallbackElement: HTMLElement): SelectionRect | null {
  const measuredRect = readNonEmptyRangeRect(range)
  if (measuredRect !== null) {
    return measuredRect
  }

  const fallbackRect = fallbackElement.getBoundingClientRect()
  return isFiniteRect(fallbackRect) ? fallbackRect : null
}

function readNonEmptyRangeRect(range: Range): SelectionRect | null {
  const rangeWithRects = range as Range & {
    readonly getBoundingClientRect?: () => DOMRect
    readonly getClientRects?: () => DOMRectList
  }

  if (typeof rangeWithRects.getBoundingClientRect === 'function') {
    const rect = rangeWithRects.getBoundingClientRect()
    if (isNonEmptyFiniteRect(rect)) {
      return rect
    }
  }

  if (typeof rangeWithRects.getClientRects !== 'function') {
    return null
  }

  for (const rect of Array.from(rangeWithRects.getClientRects())) {
    if (isNonEmptyFiniteRect(rect)) {
      return rect
    }
  }

  return null
}

function isNonEmptyFiniteRect(rect: SelectionRect): boolean {
  return isFiniteRect(rect) && (rect.width > 0 || rect.height > 0)
}

function isFiniteRect(rect: SelectionRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  )
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
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

function isInlineEditorTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('.vetra-inline-editor[contenteditable="true"]') !== null
  )
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

function shouldHandleSelectAllBlocksShortcut(target: EventTarget): boolean {
  if (isTextInputElement(target) || isEditorChromeControlTarget(target)) {
    return false
  }

  if (isLexicalActiveEditorTarget(target)) {
    return false
  }

  return !isTextEditingElement(target)
}

function shouldOpenSlashMenu(target: EventTarget): boolean {
  if (isTextInputElement(target) || isEditorChromeControlTarget(target)) {
    return false
  }

  if (isLexicalActiveEditorTarget(target)) {
    return true
  }

  return !isTextEditingElement(target)
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

function shouldDeferShellKeyHandling(target: EventTarget): boolean {
  return isTextEditingElement(target) || isEditorChromeControlTarget(target)
}

function isEditorChromeControlTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.closest('[data-vetra-block-toolbar]') !== null ||
      target.closest('[data-vetra-block-controls]') !== null)
  )
}

function isSlashMenuTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && target.closest('[data-vetra-slash-menu]') !== null
}

function isNodeTarget(target: EventTarget): target is Node {
  return target instanceof Node
}

function resolveSlashMenuTargetAnchor(
  blockShell: HTMLElement | undefined,
  target: EventTarget,
  root: HTMLElement | null,
): HTMLElement | null {
  const selectionAnchorElement = resolveSlashMenuSelectionAnchor(root)
  if (selectionAnchorElement !== null) {
    return selectionAnchorElement
  }

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

function resolveSlashMenuSelectionAnchor(root: HTMLElement | null): HTMLElement | null {
  const ownerDocument = root === null ? null : root.ownerDocument
  if (root === null || ownerDocument === null) {
    return null
  }

  const domSelection = ownerDocument.getSelection()
  if (domSelection === null || domSelection.rangeCount === 0) {
    return null
  }

  const anchorNode = domSelection.anchorNode
  const focusNode = domSelection.focusNode
  const anchorElement = getSelectionElement(anchorNode)
  const focusElement = getSelectionElement(focusNode)
  const anchorEditor = anchorElement?.closest(
    '.vetra-inline-editor[contenteditable="true"]',
  ) as HTMLElement | null
  const focusEditor = focusElement?.closest(
    '.vetra-inline-editor[contenteditable="true"]',
  ) as HTMLElement | null

  if (
    anchorEditor === null ||
    focusEditor === null ||
    anchorEditor !== focusEditor ||
    !root.contains(anchorEditor)
  ) {
    return null
  }

  if (anchorElement !== null && anchorElement !== anchorEditor) {
    return anchorElement
  }

  if (focusElement !== null && focusElement !== anchorEditor) {
    return focusElement
  }

  return anchorEditor
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
