import { parseDocument, stringifyDocument, type MigrationError } from '@vetra/persistence-json'
import {
  collectSubtreeIds,
  findParentId,
  getBlockChildren,
  getSelectedBlockIds,
  type BlockId,
  type DocumentSelection,
  type DocumentState,
  normalizeSelection,
  type DocBlock,
  type EditorRuntime,
  ok,
  type Result,
  type Transaction,
} from '@vetra/core'
import {
  type PasteBlockIdFactory,
  type PasteError,
  type PasteReferenceTarget,
  type PasteResult,
} from '@vetra/react/paste/createPasteHandler'

export const VETRA_BLOCK_CLIPBOARD_MIME_TYPE = 'application/x.vetra.blocks+json'

export interface ClipboardBlockPayload {
  readonly json: string
  readonly plainText: string
}

export interface PasteClipboardDocumentOptions {
  readonly editor: EditorRuntime
  readonly target: PasteReferenceTarget
  readonly payload: string
  readonly idFactory: PasteBlockIdFactory
}

export function createClipboardPayloadFromSelection(
  document: DocumentState,
  selection: DocumentSelection,
): ClipboardBlockPayload {
  const selectedBlockIds = getSelectedBlockIds(document, normalizeSelection(document, selection))
  if (selectedBlockIds.length === 0) {
    return { json: '', plainText: '' }
  }

  const rootSelectedIds = [...new Set(selectedBlockIds)]
  const copiedSet = new Set<BlockId>()
  const copiedIds: BlockId[] = []

  for (const sourceId of selectedBlockIds) {
    for (const copiedId of collectSubtreeIds(document, sourceId)) {
      if (!copiedSet.has(copiedId)) {
        copiedSet.add(copiedId)
        copiedIds.push(copiedId)
      }
    }
  }

  const rootId: BlockId = '__vetra-block-clipboard-root__'
  const blocks: Record<BlockId, DocBlock> = {
    [rootId]: { id: rootId, type: 'root' },
  }
  const children: Record<BlockId, readonly BlockId[]> = {
    [rootId]: rootSelectedIds,
  }

  for (const sourceId of copiedIds) {
    const sourceBlock = document.blocks[sourceId]
    if (sourceBlock === undefined) {
      continue
    }

    blocks[sourceId] = sourceBlock
    children[sourceId] = getBlockChildren(document, sourceId).filter((childId) =>
      copiedSet.has(childId),
    )
  }

  const payloadDocument: DocumentState = {
    id: `${document.id}-clipboard`,
    version: document.version,
    rootId,
    blocks,
    children,
  }

  return {
    json: stringifyDocument(payloadDocument),
    plainText: selectedBlockIds
      .map((blockId) => blockTreeToText(document, blockId))
      .filter((text) => text.length > 0)
      .join('\\n\\n'),
  }
}

export function parseClipboardPayload(json: string): Result<DocumentState, MigrationError> {
  return parseDocument(json)
}

export function pasteClipboardPayloadIntoEditor(
  options: PasteClipboardDocumentOptions,
): Result<PasteResult, PasteError> {
  const sourceResult = parseClipboardPayload(options.payload)
  if (!sourceResult.ok) {
    return {
      ok: false,
      error: {
        code: 'pasteStrategyFailed',
        message: sourceResult.error.message,
      },
    }
  }

  return pasteSourceDocumentIntoEditor({
    editor: options.editor,
    target: options.target,
    sourceDocument: sourceResult.value,
    idFactory: options.idFactory,
  })
}

function pasteSourceDocumentIntoEditor({
  editor,
  target,
  sourceDocument,
  idFactory,
}: {
  readonly editor: EditorRuntime
  readonly target: PasteReferenceTarget
  readonly sourceDocument: DocumentState
  readonly idFactory: PasteBlockIdFactory
}): Result<PasteResult, PasteError> {
  const state = editor.getState()
  const referenceParentId = findParentId(state.document, target.referenceBlockId)
  if (referenceParentId === undefined) {
    return {
      ok: false,
      error: {
        code: 'pasteStrategyFailed',
        message: `Reference block "${target.referenceBlockId}" does not exist or has no parent.`,
      },
    }
  }

  const siblings = getBlockChildren(state.document, referenceParentId)
  const referenceIndex = siblings.indexOf(target.referenceBlockId)
  if (referenceIndex === -1) {
    return {
      ok: false,
      error: {
        code: 'pasteStrategyFailed',
        message: `Reference block "${target.referenceBlockId}" is not attached to its parent.`,
      },
    }
  }

  const sourceChildren = getBlockChildren(sourceDocument, sourceDocument.rootId)
  if (sourceChildren.length === 0) {
    return ok({ handled: false, insertedBlockIds: [], transactions: [] })
  }

  const idCounter = { value: 0 }
  let insertionIndex = target.placement === 'before' ? referenceIndex : referenceIndex + 1
  const insertedBlockIds: BlockId[] = []
  const transactions: Transaction[] = []

  for (const sourceRootId of sourceChildren) {
    const subtreeResult = pasteSubtree({
      editor,
      sourceDocument,
      sourceId: sourceRootId,
      targetParentId: referenceParentId,
      insertIndex: insertionIndex,
      idFactory,
      idCounter,
    })

    if (!subtreeResult.ok) {
      return subtreeResult
    }

    insertedBlockIds.push(subtreeResult.value.rootInsertedId)
    transactions.push(...subtreeResult.value.transactions)
    insertionIndex += 1
  }

  return {
    ok: true,
    value: {
      handled: true,
      insertedBlockIds,
      transactions,
    },
  }
}

interface PasteSubtreeState {
  readonly editor: EditorRuntime
  readonly sourceDocument: DocumentState
  readonly sourceId: BlockId
  readonly targetParentId: BlockId
  readonly insertIndex: number
  readonly idFactory: PasteBlockIdFactory
  readonly idCounter: { value: number }
}

interface PasteSubtreeResult {
  readonly rootInsertedId: BlockId
  readonly transactions: readonly Transaction[]
}

function pasteSubtree({
  editor,
  sourceDocument,
  sourceId,
  targetParentId,
  insertIndex,
  idFactory,
  idCounter,
}: PasteSubtreeState): Result<PasteSubtreeResult, PasteError> {
  const sourceBlock = sourceDocument.blocks[sourceId]
  if (sourceBlock === undefined) {
    return {
      ok: false,
      error: {
        code: 'pasteStrategyFailed',
        message: `Clipboard source block "${sourceId}" is missing.`,
      },
    }
  }

  const rootInsertedId = idFactory({
    index: idCounter.value,
    text: getBlockText(sourceBlock),
    kind: VETRA_BLOCK_CLIPBOARD_MIME_TYPE,
  })
  idCounter.value += 1

  const insertResult = editor.dispatch({
    type: 'insertBlock',
    parentId: targetParentId,
    index: insertIndex,
    block: {
      ...sourceBlock,
      id: rootInsertedId,
    },
  })
  if (!insertResult.ok) {
    return {
      ok: false,
      error: insertResult.error,
    }
  }

  const childTransactions: Transaction[] = [insertResult.value]
  let childInsertionIndex = 0
  for (const sourceChildId of getBlockChildren(sourceDocument, sourceId)) {
    const childResult = pasteSubtree({
      editor,
      sourceDocument,
      sourceId: sourceChildId,
      targetParentId: rootInsertedId,
      insertIndex: childInsertionIndex,
      idFactory,
      idCounter,
    })
    if (!childResult.ok) {
      return childResult
    }

    childTransactions.push(...childResult.value.transactions)
    childInsertionIndex += 1
  }

  return ok({
    rootInsertedId,
    transactions: childTransactions,
  })
}

function blockTreeToText(document: DocumentState, rootId: BlockId): string {
  const block = document.blocks[rootId]
  if (block === undefined) {
    return ''
  }

  const childrenText = getBlockChildren(document, rootId)
    .map((childId) => blockTreeToText(document, childId))
    .filter((childText) => childText.length > 0)
    .join('\\n')
  const blockText = getBlockText(block)

  return childrenText.length > 0 && blockText.length > 0
    ? `${blockText}\\n${childrenText}`
    : `${blockText}${childrenText}`
}

function getBlockText(block: DocBlock): string {
  const content = block.content
  if (typeof content === 'string') {
    return content
  }

  const textParts: string[] = []
  appendInlineText(content, textParts)
  return textParts.join('')
}

function appendInlineText(content: unknown, textParts: string[]): void {
  if (typeof content === 'string') {
    textParts.push(content)
    return
  }

  if (!isRecord(content)) {
    return
  }

  const record = content

  const type = record.type
  const text = record.text
  if ((type === 'text' || type === 'inline-code') && typeof text === 'string') {
    textParts.push(text)
  }

  const children = record.children
  if (Array.isArray(children)) {
    for (const node of children) {
      appendInlineText(node, textParts)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
