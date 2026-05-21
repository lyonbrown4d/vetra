import {
  useCallback,
  useEffect,
  useRef,
  type CompositionEventHandler,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type RefObject,
} from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  type EditorState,
  type LexicalNode,
  type PointType,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import type { InlineContent } from '@vetra/core'
import {
  createMergeBlockBackwardIntent,
  createSplitBlockIntent,
  dispatchLexicalBlockStructuralIntent,
  type LexicalBlockContentCommit,
  type LexicalBlockCommitReason,
  type LexicalBlockStructuralIntent,
  type LexicalBlockStructuralIntentCallbacks,
  type LexicalInlineContentBoundary,
  type LexicalMergeBlockBackwardIntent,
  type LexicalSplitBlockIntent,
} from '@vetra/lexical/commandBridge/structuralIntents'
import {
  canRunStructuralKeyCommand,
  isStructuralKey,
  type LexicalBlockEditorCompositionState,
} from '@vetra/lexical/composition'
import {
  createLexicalAdapterState,
  createLexicalAdapterTextNode,
  inlineContentToLexicalAdapterState,
  lexicalAdapterStateToInlineContent,
  type LexicalAdapterTextNode,
} from '@vetra/lexical/serializers/richText'

export interface LexicalBlockEditorProps {
  readonly value: InlineContent
  readonly placeholder?: string
  readonly className?: string
  readonly autoFocus?: boolean
  readonly onCompositionChange?: (state: LexicalBlockEditorCompositionState) => void
  readonly onCommit?: (commit: LexicalBlockContentCommit) => void
  readonly onChange: (nextValue: InlineContent) => void
  readonly onMergeBlockBackward?: (intent: LexicalMergeBlockBackwardIntent) => void
  readonly onSplitBlock?: (intent: LexicalSplitBlockIntent) => void
  readonly onStructuralIntent?: (intent: LexicalBlockStructuralIntent) => void
}

interface LexicalBlockEditorBridgeCallbacks extends LexicalBlockStructuralIntentCallbacks {
  readonly onCommit: ((commit: LexicalBlockContentCommit) => void) | undefined
}

export function LexicalBlockEditor(props: LexicalBlockEditorProps) {
  const initialState = inlineContentToLexicalAdapterState(props.value)
  const latestValueRef = useRef(props.value)
  const ignoreContentUpdatesAfterStructuralIntentRef = useRef(false)
  const compositionStateRef = useRef<LexicalBlockEditorCompositionState>({
    isComposing: false,
  })
  const bridgeCallbacksRef = useLatestRef<LexicalBlockEditorBridgeCallbacks>({
    onCommit: props.onCommit,
    onMergeBlockBackward: props.onMergeBlockBackward,
    onSplitBlock: props.onSplitBlock,
    onStructuralIntent: props.onStructuralIntent,
  })
  const commitLatestContentOnUnmount = useCallback(() => {
    emitContentCommit(
      'unmount',
      latestValueRef.current,
      bridgeCallbacksRef.current,
      ignoreContentUpdatesAfterStructuralIntentRef,
    )
  }, [bridgeCallbacksRef])

  useEffect(() => {
    return commitLatestContentOnUnmount
  }, [commitLatestContentOnUnmount])

  const updateCompositionState = (isComposing: boolean) => {
    const nextState = { isComposing }
    compositionStateRef.current = nextState
    props.onCompositionChange?.(nextState)
  }

  const handleCompositionStart: CompositionEventHandler<HTMLDivElement> = () => {
    updateCompositionState(true)
  }

  const handleCompositionEnd: CompositionEventHandler<HTMLDivElement> = () => {
    updateCompositionState(false)
  }

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    const isComposing = compositionStateRef.current.isComposing || event.nativeEvent.isComposing

    if (isStructuralKey(event.key) && !canRunStructuralKeyCommand({ isComposing })) {
      event.stopPropagation()
    }
  }

  const handleBlur: FocusEventHandler<HTMLDivElement> = () => {
    emitContentCommit(
      'blur',
      latestValueRef.current,
      bridgeCallbacksRef.current,
      ignoreContentUpdatesAfterStructuralIntentRef,
    )
  }

  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'VetraBlockEditor',
        onError(error) {
          throw error
        },
        editorState() {
          const root = $getRoot()
          root.clear()
          const paragraph = $createParagraphNode()
          for (const textNode of initialState.root.children[0]?.children ?? []) {
            paragraph.append(createLexicalTextNode(textNode))
          }
          root.append(paragraph)
        },
      }}
    >
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            autoFocus={props.autoFocus}
            className={props.className}
            onBlur={handleBlur}
            onCompositionEnd={handleCompositionEnd}
            onCompositionStart={handleCompositionStart}
            onKeyDown={handleKeyDown}
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
        placeholder={
          props.placeholder === undefined ? null : (
            <div className="vetra-lexical-placeholder">{props.placeholder}</div>
          )
        }
      />
      <OnChangePlugin
        onChange={(editorState: EditorState) => {
          if (ignoreContentUpdatesAfterStructuralIntentRef.current) {
            return
          }

          editorState.read(() => {
            const nextValue = readInlineContentFromLexicalRoot()
            latestValueRef.current = nextValue
            props.onChange(nextValue)
          })
        }}
      />
      <StructuralCommandBridgePlugin
        bridgeCallbacksRef={bridgeCallbacksRef}
        compositionStateRef={compositionStateRef}
        ignoreContentUpdatesAfterStructuralIntentRef={ignoreContentUpdatesAfterStructuralIntentRef}
      />
    </LexicalComposer>
  )
}

function StructuralCommandBridgePlugin(props: {
  readonly bridgeCallbacksRef: RefObject<LexicalBlockEditorBridgeCallbacks>
  readonly compositionStateRef: RefObject<LexicalBlockEditorCompositionState>
  readonly ignoreContentUpdatesAfterStructuralIntentRef: RefObject<boolean>
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        const compositionState = readCompositionState(props.compositionStateRef, event)

        if (!canRunStructuralKeyCommand(compositionState)) {
          return false
        }

        const boundary = readInlineContentBoundaryFromLexicalSelection()

        if (boundary === undefined) {
          return false
        }

        const intent = createSplitBlockIntent(boundary, compositionState)

        if (intent === undefined) {
          return false
        }

        const handled = dispatchStructuralIntent(intent, props.bridgeCallbacksRef.current)

        if (!handled) {
          return false
        }

        event?.preventDefault()
        props.ignoreContentUpdatesAfterStructuralIntentRef.current = true
        return handled
      },
      COMMAND_PRIORITY_HIGH,
    )
    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const compositionState = readCompositionState(props.compositionStateRef, event)

        if (!canRunStructuralKeyCommand(compositionState)) {
          return false
        }

        const boundary = readInlineContentBoundaryFromLexicalSelection()

        if (boundary === undefined) {
          return false
        }

        const intent = createMergeBlockBackwardIntent(boundary, compositionState)

        if (intent === undefined) {
          return false
        }

        const handled = dispatchStructuralIntent(intent, props.bridgeCallbacksRef.current)

        if (!handled) {
          return false
        }

        event.preventDefault()
        props.ignoreContentUpdatesAfterStructuralIntentRef.current = true
        return handled
      },
      COMMAND_PRIORITY_HIGH,
    )

    return () => {
      unregisterEnter()
      unregisterBackspace()
    }
  }, [
    editor,
    props.bridgeCallbacksRef,
    props.compositionStateRef,
    props.ignoreContentUpdatesAfterStructuralIntentRef,
  ])

  return null
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

function readCompositionState(
  compositionStateRef: RefObject<LexicalBlockEditorCompositionState>,
  event: KeyboardEvent | null,
): LexicalBlockEditorCompositionState {
  return {
    isComposing: compositionStateRef.current.isComposing || (event?.isComposing ?? false),
  }
}

function emitContentCommit(
  reason: LexicalBlockCommitReason,
  content: InlineContent,
  callbacks: LexicalBlockEditorBridgeCallbacks,
  ignoreContentUpdatesAfterStructuralIntentRef: RefObject<boolean>,
): void {
  if (ignoreContentUpdatesAfterStructuralIntentRef.current) {
    return
  }

  callbacks.onCommit?.({
    type: 'commitInlineContent',
    reason,
    content,
  })
}

function dispatchStructuralIntent(
  intent: LexicalBlockStructuralIntent,
  callbacks: LexicalBlockEditorBridgeCallbacks,
): boolean {
  return dispatchLexicalBlockStructuralIntent(intent, callbacks)
}

function createLexicalTextNode(node: LexicalAdapterTextNode) {
  return $createTextNode(node.text).setFormat(node.format)
}

function readInlineContentBoundaryFromLexicalSelection(): LexicalInlineContentBoundary | undefined {
  const selection = $getSelection()

  if (!$isRangeSelection(selection)) {
    return undefined
  }

  const points = selection.getStartEndPoints()

  if (points === null) {
    return undefined
  }

  return {
    content: readInlineContentFromLexicalRoot(),
    isCollapsed: selection.isCollapsed(),
    textOffset: getTextOffsetBeforePoint(points[0]),
  }
}

function getTextOffsetBeforePoint(point: PointType): number {
  let textOffset = 0
  let foundPoint = false
  const pointNode = point.getNode()

  const visit = (node: LexicalNode): void => {
    if (foundPoint) {
      return
    }

    if (node.is(pointNode)) {
      textOffset += getTextOffsetInsidePointNode(point, node)
      foundPoint = true
      return
    }

    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        visit(child)
      }
      return
    }

    textOffset += node.getTextContent().length
  }

  visit($getRoot())

  return textOffset
}

function getTextOffsetInsidePointNode(point: PointType, node: LexicalNode): number {
  if (point.type === 'text') {
    return point.offset
  }

  if (!$isElementNode(node)) {
    return 0
  }

  let textOffset = 0
  const children = node.getChildren()
  const childCount = Math.min(point.offset, children.length)

  for (let index = 0; index < childCount; index += 1) {
    const child = children[index]

    if (child !== undefined) {
      textOffset += child.getTextContent().length
    }
  }

  return textOffset
}

function readInlineContentFromLexicalRoot(): InlineContent {
  const textNodes: LexicalAdapterTextNode[] = []

  for (const child of $getRoot().getChildren()) {
    collectTextNodes(child, textNodes)
  }

  return lexicalAdapterStateToInlineContent(createLexicalAdapterState(textNodes))
}

function collectTextNodes(node: LexicalNode, textNodes: LexicalAdapterTextNode[]): void {
  if ($isTextNode(node)) {
    textNodes.push(createLexicalAdapterTextNode(node.getTextContent(), node.getFormat()))
    return
  }

  if ($isLineBreakNode(node)) {
    textNodes.push(createLexicalAdapterTextNode('\n'))
    return
  }

  if (!$isElementNode(node)) {
    const text = node.getTextContent()

    if (text.length > 0) {
      textNodes.push(createLexicalAdapterTextNode(text))
    }

    return
  }

  for (const child of node.getChildren()) {
    collectTextNodes(child, textNodes)
  }
}
