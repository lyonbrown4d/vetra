import { createEmptyInlineContent, type InlineContent, type InlineNode } from '@vetra/core'
import {
  canRunStructuralKeyCommand,
  type LexicalBlockEditorCompositionState,
} from '@vetra/lexical/composition'

export type LexicalBlockCommitReason = 'blur' | 'unmount'

export interface LexicalBlockContentCommit {
  readonly type: 'commitInlineContent'
  readonly reason: LexicalBlockCommitReason
  readonly content: InlineContent
}

export interface LexicalInlineContentBoundary {
  readonly content: InlineContent
  readonly isCollapsed: boolean
  readonly textOffset: number
}

export interface LexicalSplitBlockIntent {
  readonly type: 'splitBlock'
  readonly before: InlineContent
  readonly after: InlineContent
}

export interface LexicalMergeBlockBackwardIntent {
  readonly type: 'mergeBlockBackward'
  readonly content: InlineContent
}

export type LexicalBlockStructuralIntent = LexicalSplitBlockIntent | LexicalMergeBlockBackwardIntent
export type LexicalBlockStructuralIntentResult = unknown

export interface LexicalBlockStructuralIntentCallbacks {
  readonly onMergeBlockBackward:
    | ((intent: LexicalMergeBlockBackwardIntent) => LexicalBlockStructuralIntentResult)
    | undefined
  readonly onSplitBlock:
    | ((intent: LexicalSplitBlockIntent) => LexicalBlockStructuralIntentResult)
    | undefined
  readonly onStructuralIntent:
    | ((intent: LexicalBlockStructuralIntent) => LexicalBlockStructuralIntentResult)
    | undefined
}

export function dispatchLexicalBlockStructuralIntent(
  intent: LexicalBlockStructuralIntent,
  callbacks: LexicalBlockStructuralIntentCallbacks,
): boolean {
  const genericResult = callbacks.onStructuralIntent?.(intent)
  const hasGenericHandler = callbacks.onStructuralIntent !== undefined

  switch (intent.type) {
    case 'splitBlock':
      return resolveStructuralIntentHandlerResult(
        callbacks.onSplitBlock,
        hasGenericHandler,
        genericResult,
        intent,
      )
    case 'mergeBlockBackward':
      return resolveStructuralIntentHandlerResult(
        callbacks.onMergeBlockBackward,
        hasGenericHandler,
        genericResult,
        intent,
      )
  }
}

export function createSplitBlockIntent(
  boundary: LexicalInlineContentBoundary,
  compositionState: LexicalBlockEditorCompositionState,
): LexicalSplitBlockIntent | undefined {
  if (!boundary.isCollapsed || !canRunStructuralKeyCommand(compositionState)) {
    return undefined
  }

  const split = splitInlineContentAtTextOffset(boundary.content, boundary.textOffset)

  return {
    type: 'splitBlock',
    before: split.before,
    after: split.after,
  }
}

export function createMergeBlockBackwardIntent(
  boundary: LexicalInlineContentBoundary,
  compositionState: LexicalBlockEditorCompositionState,
): LexicalMergeBlockBackwardIntent | undefined {
  if (!isStartLikeBoundary(boundary) || !canRunStructuralKeyCommand(compositionState)) {
    return undefined
  }

  return {
    type: 'mergeBlockBackward',
    content: boundary.content,
  }
}

export function isStartLikeBoundary(boundary: LexicalInlineContentBoundary): boolean {
  return boundary.isCollapsed && boundary.textOffset <= 0
}

export function splitInlineContentAtTextOffset(
  content: InlineContent,
  textOffset: number,
): { readonly before: InlineContent; readonly after: InlineContent } {
  const clampedOffset = clampTextOffset(textOffset, getInlineContentTextLength(content))
  const split = splitInlineNodesAtTextOffset(content.children, clampedOffset)

  return {
    before: createInlineContentFromNodes(split.before),
    after: createInlineContentFromNodes(split.after),
  }
}

function splitInlineNodesAtTextOffset(
  nodes: readonly InlineNode[],
  textOffset: number,
): { readonly before: readonly InlineNode[]; readonly after: readonly InlineNode[] } {
  const before: InlineNode[] = []
  const after: InlineNode[] = []
  let remainingOffset = textOffset

  for (const node of nodes) {
    const nodeLength = getInlineNodeTextLength(node)

    if (remainingOffset <= 0) {
      after.push(node)
      continue
    }

    if (remainingOffset >= nodeLength) {
      before.push(node)
      remainingOffset -= nodeLength
      continue
    }

    const nodeSplit = splitInlineNodeAtTextOffset(node, remainingOffset)
    before.push(...nodeSplit.before)
    after.push(...nodeSplit.after)
    remainingOffset = 0
  }

  return { before, after }
}

function splitInlineNodeAtTextOffset(
  node: InlineNode,
  textOffset: number,
): { readonly before: readonly InlineNode[]; readonly after: readonly InlineNode[] } {
  switch (node.type) {
    case 'text':
      return splitTextInlineNode(node, textOffset)
    case 'inline-code':
      return splitInlineCodeNode(node, textOffset)
    case 'link':
      return splitLinkInlineNode(node, textOffset)
    case 'mention':
      return textOffset >= getInlineNodeTextLength(node)
        ? { before: [node], after: [] }
        : { before: [], after: [node] }
  }
}

function splitTextInlineNode(
  node: Extract<InlineNode, { readonly type: 'text' }>,
  textOffset: number,
): { readonly before: readonly InlineNode[]; readonly after: readonly InlineNode[] } {
  const beforeText = node.text.slice(0, textOffset)
  const afterText = node.text.slice(textOffset)

  return {
    before:
      beforeText.length === 0
        ? []
        : [
            {
              type: 'text',
              text: beforeText,
              ...(node.marks === undefined ? {} : { marks: node.marks }),
            },
          ],
    after:
      afterText.length === 0
        ? []
        : [
            {
              type: 'text',
              text: afterText,
              ...(node.marks === undefined ? {} : { marks: node.marks }),
            },
          ],
  }
}

function splitInlineCodeNode(
  node: Extract<InlineNode, { readonly type: 'inline-code' }>,
  textOffset: number,
): { readonly before: readonly InlineNode[]; readonly after: readonly InlineNode[] } {
  const beforeText = node.text.slice(0, textOffset)
  const afterText = node.text.slice(textOffset)

  return {
    before: beforeText.length === 0 ? [] : [{ type: 'inline-code', text: beforeText }],
    after: afterText.length === 0 ? [] : [{ type: 'inline-code', text: afterText }],
  }
}

function splitLinkInlineNode(
  node: Extract<InlineNode, { readonly type: 'link' }>,
  textOffset: number,
): { readonly before: readonly InlineNode[]; readonly after: readonly InlineNode[] } {
  const split = splitInlineNodesAtTextOffset(node.children, textOffset)

  return {
    before:
      split.before.length === 0
        ? []
        : [
            {
              type: 'link',
              href: node.href,
              children: split.before,
            },
          ],
    after:
      split.after.length === 0
        ? []
        : [
            {
              type: 'link',
              href: node.href,
              children: split.after,
            },
          ],
  }
}

function createInlineContentFromNodes(nodes: readonly InlineNode[]): InlineContent {
  return nodes.length === 0
    ? createEmptyInlineContent()
    : {
        type: 'inline-content',
        version: 1,
        children: nodes,
      }
}

function getInlineContentTextLength(content: InlineContent): number {
  return content.children.reduce((length, node) => length + getInlineNodeTextLength(node), 0)
}

function getInlineNodeTextLength(node: InlineNode): number {
  switch (node.type) {
    case 'text':
    case 'inline-code':
      return node.text.length
    case 'mention':
      return node.label.length
    case 'link':
      return node.children.reduce((length, child) => length + getInlineNodeTextLength(child), 0)
  }
}

function clampTextOffset(textOffset: number, textLength: number): number {
  if (textOffset <= 0) {
    return 0
  }

  if (textOffset >= textLength) {
    return textLength
  }

  return textOffset
}

function resolveStructuralIntentHandlerResult<TIntent extends LexicalBlockStructuralIntent>(
  handler: ((intent: TIntent) => LexicalBlockStructuralIntentResult) | undefined,
  hasGenericHandler: boolean,
  genericResult: LexicalBlockStructuralIntentResult,
  intent: TIntent,
): boolean {
  if (handler !== undefined) {
    return handler(intent) !== false
  }

  return hasGenericHandler && genericResult !== false
}
