import { markdownToDocument } from '@vetra/import-markdown'
import { plainTextToDocument, type PlainTextSplitStrategy } from '@vetra/import-plain-text'
import {
  err,
  ok,
  type BlockId,
  type CommandError,
  collectSubtreeIds,
  type DocBlock,
  type DocumentState,
  type EditorRuntime,
  findParentId,
  getBlockChildren,
  type Result,
  type Transaction,
} from '@vetra/core'

export const plainTextPasteKind = 'plain-text'
export const markdownPasteKind = 'markdown'
export const htmlPasteKind = 'html'

export type PasteDataKind = string
export type PastePlacement = 'before' | 'after'

export interface PasteReferenceTarget {
  readonly referenceBlockId: BlockId
  readonly placement?: PastePlacement
  readonly replaceBlockIds?: readonly BlockId[]
}

export interface PasteInput {
  readonly text: string
  readonly kind?: PasteDataKind
}

export interface PasteBlockIdContext {
  readonly index: number
  readonly text: string
  readonly kind: PasteDataKind
  readonly splitBy?: PlainTextSplitStrategy
}

export type PasteBlockIdFactory = (context: PasteBlockIdContext) => BlockId

export interface PasteStrategyInput {
  readonly text: string
  readonly kind: PasteDataKind
}

export interface PasteStrategyContext {
  readonly idFactory: PasteBlockIdFactory
}

export interface PasteBlockFragment {
  readonly rootBlockIds: readonly BlockId[]
  readonly blocks: Readonly<Record<BlockId, DocBlock>>
  readonly children: Readonly<Record<BlockId, readonly BlockId[]>>
}

export type PasteBlockStrategy = (
  input: PasteStrategyInput,
  context: PasteStrategyContext,
) => PasteStrategyResult

export type PasteStrategyResult = PasteBlockFragment | readonly DocBlock[]

export type PasteDocumentImporter = (
  input: PasteStrategyInput,
  context: PasteStrategyContext,
) => DocumentState

export interface PlainTextPasteStrategyOptions {
  readonly splitBy?: PlainTextSplitStrategy
}

export interface DefaultPasteStrategyOptions {
  readonly plainText?: PlainTextPasteStrategyOptions
}

export interface CreatePasteHandlerOptions {
  readonly editor: EditorRuntime
  readonly target: PasteReferenceTarget
  readonly idFactory?: PasteBlockIdFactory
  readonly strategy?: PasteBlockStrategy
  readonly plainText?: PlainTextPasteStrategyOptions
}

export interface PasteIntoEditorOptions extends CreatePasteHandlerOptions {
  readonly input: PasteInput
}

export interface PasteFragmentIntoEditorOptions {
  readonly editor: EditorRuntime
  readonly target: PasteReferenceTarget
  readonly fragment: PasteBlockFragment
}

interface ImportPasteFragmentOptions {
  readonly input: PasteInput
  readonly idFactory: PasteBlockIdFactory
  readonly strategy: PasteBlockStrategy
}

export type PastePreparationErrorCode =
  | 'pasteBlockAlreadyExists'
  | 'pasteDuplicateBlockId'
  | 'pasteStrategyFailed'

export interface PastePreparationError {
  readonly code: PastePreparationErrorCode
  readonly message: string
  readonly cause?: unknown
}

export type PasteError = CommandError | PastePreparationError

export interface PasteResult {
  readonly handled: boolean
  readonly insertedBlockIds: readonly BlockId[]
  readonly transactions: readonly Transaction[]
}

export type PasteHandler = (input: PasteInput) => Result<PasteResult, PasteError>

let defaultPasteBlockIdCounter = 0

const pasteImportRootId = '__vetra-paste-import-root__'

export const defaultPasteBlockIdFactory: PasteBlockIdFactory = ({ index }) => {
  defaultPasteBlockIdCounter += 1

  return `paste-${Date.now().toString(36)}-${String(defaultPasteBlockIdCounter)}-${String(index + 1)}`
}

export function createPlainTextPasteStrategy(
  options: PlainTextPasteStrategyOptions = {},
): PasteBlockStrategy {
  const splitBy = options.splitBy ?? 'paragraph'

  return (input, context) => {
    const document = plainTextToDocument(input.text, {
      rootId: pasteImportRootId,
      splitBy,
      idFactory: ({ index, text }) =>
        context.idFactory({
          index,
          text,
          kind: plainTextPasteKind,
          splitBy,
        }),
    })

    return createPasteFragmentFromDocument(document)
  }
}

export function createMarkdownPasteStrategy(): PasteBlockStrategy {
  return (input, context) => {
    const document = markdownToDocument(input.text, {
      rootId: pasteImportRootId,
      generateBlockId: ({ ordinal }) =>
        context.idFactory({
          index: ordinal - 1,
          text: input.text,
          kind: markdownPasteKind,
        }),
    })

    return createPasteFragmentFromDocument(document)
  }
}

export function createDefaultPasteStrategy(
  options: DefaultPasteStrategyOptions = {},
): PasteBlockStrategy {
  const plainTextStrategy = createPlainTextPasteStrategy(options.plainText)
  const markdownStrategy = createMarkdownPasteStrategy()

  return (input, context) => {
    if (shouldUseMarkdownPasteStrategy(input)) {
      return markdownStrategy(
        {
          text: input.text,
          kind: markdownPasteKind,
        },
        context,
      )
    }

    return plainTextStrategy(input, context)
  }
}

export function createDocumentPasteStrategy(
  importDocument: PasteDocumentImporter,
): PasteBlockStrategy {
  return (input, context) => createPasteFragmentFromDocument(importDocument(input, context))
}

function resolveDefaultPasteStrategyOptions(
  plainText: PlainTextPasteStrategyOptions | undefined,
): DefaultPasteStrategyOptions {
  return plainText === undefined ? {} : { plainText }
}
export function createPasteHandler(options: CreatePasteHandlerOptions): PasteHandler {
  const strategy =
    options.strategy ??
    createDefaultPasteStrategy(resolveDefaultPasteStrategyOptions(options.plainText))
  const idFactory = options.idFactory ?? defaultPasteBlockIdFactory

  return (input) =>
    pasteIntoEditor({
      ...options,
      input,
      idFactory,
      strategy,
    })
}

export function pasteIntoEditor(options: PasteIntoEditorOptions): Result<PasteResult, PasteError> {
  if (options.input.text.length === 0) {
    return ok(createNoopPasteResult())
  }

  const strategy =
    options.strategy ??
    createDefaultPasteStrategy(resolveDefaultPasteStrategyOptions(options.plainText))
  const idFactory = options.idFactory ?? defaultPasteBlockIdFactory
  const importResult = importPasteFragment({
    input: options.input,
    idFactory,
    strategy,
  })
  if (!importResult.ok) {
    return importResult
  }

  return pasteFragmentIntoEditor({
    editor: options.editor,
    target: options.target,
    fragment: importResult.value,
  })
}

function shouldUseMarkdownPasteStrategy(input: PasteStrategyInput): boolean {
  if (input.kind === markdownPasteKind) {
    return true
  }

  if (input.kind !== plainTextPasteKind) {
    return false
  }

  return isObviousMarkdownPlainText(input.text)
}

function isObviousMarkdownPlainText(text: string): boolean {
  const lines = normalizePasteLineEndings(text).split('\n')
  const nonBlankLines = lines.filter((line) => line.trim().length > 0)

  if (nonBlankLines.length === 0) {
    return false
  }

  if (hasClosedCodeFence(nonBlankLines)) {
    return true
  }

  if (nonBlankLines.some(isHeadingLine)) {
    return true
  }

  if (nonBlankLines.some(isQuoteLine)) {
    return true
  }

  return nonBlankLines.length === 1 && isDividerLine(nonBlankLines[0] ?? '')
}

function normalizePasteLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function hasClosedCodeFence(nonBlankLines: readonly string[]): boolean {
  const opening = parseFenceOpening(nonBlankLines[0] ?? '')
  if (opening === undefined) {
    return false
  }

  return nonBlankLines.slice(1).some((line) => isFenceClosing(line, opening))
}

interface PasteFenceOpening {
  readonly marker: '`' | '~'
  readonly length: number
}

function parseFenceOpening(line: string): PasteFenceOpening | undefined {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line)
  const fence = match?.[2]
  if (fence === undefined) {
    return undefined
  }

  const marker = fence[0]
  if (marker !== '`' && marker !== '~') {
    return undefined
  }

  return {
    marker,
    length: fence.length,
  }
}

function isFenceClosing(line: string, opening: PasteFenceOpening): boolean {
  const trimmed = line.trim()
  let markerCount = 0

  while (trimmed[markerCount] === opening.marker) {
    markerCount += 1
  }

  return markerCount >= opening.length && trimmed.slice(markerCount).trim().length === 0
}

function isHeadingLine(line: string): boolean {
  return /^ {0,3}#{1,6}[ \t]+\S/.test(line)
}

function isQuoteLine(line: string): boolean {
  return /^ {0,3}>[ \t]+\S/.test(line) || /^ {0,3}>[ \t]*$/.test(line)
}

function isDividerLine(line: string): boolean {
  return /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)
}

function importPasteFragment(
  options: ImportPasteFragmentOptions,
): Result<PasteBlockFragment, PasteError> {
  const kind = options.input.kind ?? plainTextPasteKind

  try {
    const strategyOutput = options.strategy(
      {
        text: options.input.text,
        kind,
      },
      {
        idFactory: options.idFactory,
      },
    )

    return normalizePasteStrategyOutput(strategyOutput)
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.length > 0 ? cause.message : 'Paste strategy failed.'

    return err({
      code: 'pasteStrategyFailed',
      message,
      cause,
    })
  }
}

function normalizePasteStrategyOutput(
  output: PasteStrategyResult,
): Result<PasteBlockFragment, PasteError> {
  if (isPasteBlockFragment(output)) {
    const children: Record<BlockId, readonly BlockId[]> = { ...output.children }
    for (const blockId of Object.keys(output.blocks)) {
      children[blockId] = children[blockId] ?? []
    }

    return ok({
      rootBlockIds: [...output.rootBlockIds],
      blocks: { ...output.blocks },
      children,
    })
  }

  return createPasteFragmentFromBlocks(output)
}

function isPasteBlockFragment(output: PasteStrategyResult): output is PasteBlockFragment {
  return !Array.isArray(output)
}

export function createPasteFragmentFromBlocks(
  blocks: readonly DocBlock[],
): Result<PasteBlockFragment, PasteError> {
  const fragmentBlocks: Record<BlockId, DocBlock> = {}
  const children: Record<BlockId, readonly BlockId[]> = {}
  const rootBlockIds: BlockId[] = []

  for (const block of blocks) {
    if (fragmentBlocks[block.id] !== undefined) {
      return err({
        code: 'pasteDuplicateBlockId',
        message: `Paste strategy produced duplicate block id "${block.id}".`,
      })
    }

    rootBlockIds.push(block.id)
    fragmentBlocks[block.id] = block
    children[block.id] = []
  }

  return ok({
    rootBlockIds,
    blocks: fragmentBlocks,
    children,
  })
}

export function createPasteFragmentFromDocument(document: DocumentState): PasteBlockFragment {
  const rootBlockIds = getBlockChildren(document, document.rootId)
  const copiedIds: BlockId[] = []
  const copiedIdSet = new Set<BlockId>()

  for (const rootBlockId of rootBlockIds) {
    for (const blockId of collectSubtreeIds(document, rootBlockId)) {
      if (!copiedIdSet.has(blockId)) {
        copiedIdSet.add(blockId)
        copiedIds.push(blockId)
      }
    }
  }

  const blocks: Record<BlockId, DocBlock> = {}
  const children: Record<BlockId, readonly BlockId[]> = {}

  for (const blockId of copiedIds) {
    const block = document.blocks[blockId]
    if (block === undefined) {
      throw new Error(`Paste document references missing block "${blockId}".`)
    }

    blocks[blockId] = block
    children[blockId] = getBlockChildren(document, blockId).filter((childId) =>
      copiedIdSet.has(childId),
    )
  }

  return {
    rootBlockIds,
    blocks,
    children,
  }
}

function validatePasteFragment(
  document: DocumentState,
  fragment: PasteBlockFragment,
): Result<void, PasteError> {
  const seenBlockIds = new Set<BlockId>()

  for (const rootBlockId of fragment.rootBlockIds) {
    const result = validatePasteFragmentSubtree(document, fragment, rootBlockId, seenBlockIds)
    if (!result.ok) {
      return result
    }
  }

  for (const blockId of Object.keys(fragment.blocks)) {
    if (!seenBlockIds.has(blockId)) {
      return err({
        code: 'pasteStrategyFailed',
        message: `Paste strategy produced unreachable block "${blockId}".`,
      })
    }
  }

  return ok(undefined)
}

function validatePasteFragmentSubtree(
  document: DocumentState,
  fragment: PasteBlockFragment,
  blockId: BlockId,
  seenBlockIds: Set<BlockId>,
): Result<void, PasteError> {
  if (seenBlockIds.has(blockId)) {
    return err({
      code: 'pasteDuplicateBlockId',
      message: `Paste strategy produced duplicate block id "${blockId}".`,
    })
  }

  const block = fragment.blocks[blockId]
  if (block === undefined) {
    return err({
      code: 'pasteStrategyFailed',
      message: `Paste strategy referenced missing block "${blockId}".`,
    })
  }

  if (block.id !== blockId) {
    return err({
      code: 'pasteStrategyFailed',
      message: `Paste strategy produced block "${block.id}" under map key "${blockId}".`,
    })
  }

  if (document.blocks[block.id] !== undefined) {
    return err({
      code: 'pasteBlockAlreadyExists',
      message: `Paste strategy produced existing block id "${block.id}".`,
    })
  }

  seenBlockIds.add(blockId)

  for (const childId of fragment.children[blockId] ?? []) {
    const result = validatePasteFragmentSubtree(document, fragment, childId, seenBlockIds)
    if (!result.ok) {
      return result
    }
  }

  return ok(undefined)
}

export function pasteFragmentIntoEditor({
  editor,
  target,
  fragment,
}: PasteFragmentIntoEditorOptions): Result<PasteResult, PasteError> {
  if (fragment.rootBlockIds.length === 0) {
    return ok(createNoopPasteResult())
  }

  const document = editor.getState().document
  const insertion = resolvePasteInsertion(document, target)
  if (!insertion.ok) {
    return insertion
  }

  const validationResult = validatePasteFragment(document, fragment)
  if (!validationResult.ok) {
    return validationResult
  }

  const result = editor.dispatch({
    type: 'insertBlockFragment',
    parentId: insertion.value.parentId,
    index: insertion.value.index,
    rootBlockIds: fragment.rootBlockIds,
    blocks: fragment.blocks,
    children: fragment.children,
    ...(target.replaceBlockIds === undefined ? {} : { replaceBlockIds: target.replaceBlockIds }),
  })

  if (!result.ok) {
    return result
  }

  return ok({
    handled: true,
    insertedBlockIds: fragment.rootBlockIds,
    transactions: [result.value],
  })
}

function resolvePasteInsertion(
  document: DocumentState,
  target: PasteReferenceTarget,
): Result<{ readonly parentId: BlockId; readonly index: number }, PasteError> {
  if (document.blocks[target.referenceBlockId] === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Reference block "${target.referenceBlockId}" does not exist.`,
    })
  }

  const parentId = findParentId(document, target.referenceBlockId)
  if (parentId === undefined) {
    return err({
      code: 'invalidParent',
      message: `Reference block "${target.referenceBlockId}" is not attached to a parent.`,
    })
  }

  const siblings = getBlockChildren(document, parentId)
  const referenceIndex = siblings.indexOf(target.referenceBlockId)
  if (referenceIndex === -1) {
    return err({
      code: 'invalidParent',
      message: `Reference block "${target.referenceBlockId}" is not a child of "${parentId}".`,
    })
  }

  return ok({
    parentId,
    index: target.placement === 'before' ? referenceIndex : referenceIndex + 1,
  })
}

function createNoopPasteResult(): PasteResult {
  return {
    handled: false,
    insertedBlockIds: [],
    transactions: [],
  }
}
