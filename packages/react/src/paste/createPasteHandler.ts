import { plainTextToDocument, type PlainTextSplitStrategy } from '@vetra/import-plain-text'
import {
  err,
  ok,
  type BlockId,
  type CommandError,
  type DocBlock,
  type DocumentState,
  type EditorRuntime,
  type Result,
  type Transaction,
} from '@vetra/core'

export const plainTextPasteKind = 'plain-text'
export const markdownPasteKind = 'markdown'

export type PasteDataKind = string
export type PastePlacement = 'before' | 'after'

export interface PasteReferenceTarget {
  readonly referenceBlockId: BlockId
  readonly placement?: PastePlacement
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

export type PasteBlockStrategy = (
  input: PasteStrategyInput,
  context: PasteStrategyContext,
) => readonly DocBlock[]

export type PasteDocumentImporter = (
  input: PasteStrategyInput,
  context: PasteStrategyContext,
) => DocumentState

export interface PlainTextPasteStrategyOptions {
  readonly splitBy?: PlainTextSplitStrategy
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

interface ImportPasteBlocksOptions {
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

    return getRootBlocks(document)
  }
}

export function createDocumentPasteStrategy(
  importDocument: PasteDocumentImporter,
): PasteBlockStrategy {
  return (input, context) => getRootBlocks(importDocument(input, context))
}

export function createPasteHandler(options: CreatePasteHandlerOptions): PasteHandler {
  const strategy = options.strategy ?? createPlainTextPasteStrategy(options.plainText)
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

  const strategy = options.strategy ?? createPlainTextPasteStrategy(options.plainText)
  const idFactory = options.idFactory ?? defaultPasteBlockIdFactory
  const importResult = importPasteBlocks({
    input: options.input,
    idFactory,
    strategy,
  })
  if (!importResult.ok) {
    return importResult
  }

  const blocks = importResult.value
  if (blocks.length === 0) {
    return ok(createNoopPasteResult())
  }

  const validationResult = validatePasteBlocks(options.editor, options.target, blocks)
  if (!validationResult.ok) {
    return validationResult
  }

  return dispatchPasteBlocks(options.editor, options.target, blocks)
}

function importPasteBlocks(
  options: ImportPasteBlocksOptions,
): Result<readonly DocBlock[], PasteError> {
  const kind = options.input.kind ?? plainTextPasteKind

  try {
    return ok(
      options.strategy(
        {
          text: options.input.text,
          kind,
        },
        {
          idFactory: options.idFactory,
        },
      ),
    )
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

function validatePasteBlocks(
  editor: EditorRuntime,
  target: PasteReferenceTarget,
  blocks: readonly DocBlock[],
): Result<void, PasteError> {
  const document = editor.getState().document
  if (document.blocks[target.referenceBlockId] === undefined) {
    return err({
      code: 'blockNotFound',
      message: `Reference block "${target.referenceBlockId}" does not exist.`,
    })
  }

  const seenBlockIds = new Set<BlockId>()
  for (const block of blocks) {
    if (seenBlockIds.has(block.id)) {
      return err({
        code: 'pasteDuplicateBlockId',
        message: `Paste strategy produced duplicate block id "${block.id}".`,
      })
    }

    if (document.blocks[block.id] !== undefined) {
      return err({
        code: 'pasteBlockAlreadyExists',
        message: `Paste strategy produced existing block id "${block.id}".`,
      })
    }

    seenBlockIds.add(block.id)
  }

  return ok(undefined)
}

function dispatchPasteBlocks(
  editor: EditorRuntime,
  target: PasteReferenceTarget,
  blocks: readonly DocBlock[],
): Result<PasteResult, PasteError> {
  const insertedBlockIds: BlockId[] = []
  const transactions: Transaction[] = []
  const initialPlacement = target.placement ?? 'after'
  let referenceBlockId = target.referenceBlockId

  for (const [index, block] of blocks.entries()) {
    const result =
      index === 0 && initialPlacement === 'before'
        ? editor.dispatch({
            type: 'insertBlockBefore',
            referenceBlockId,
            block,
          })
        : editor.dispatch({
            type: 'insertBlockAfter',
            referenceBlockId,
            block,
          })

    if (!result.ok) {
      return result
    }

    insertedBlockIds.push(block.id)
    transactions.push(result.value)
    referenceBlockId = block.id
  }

  return ok({
    handled: true,
    insertedBlockIds,
    transactions,
  })
}

function getRootBlocks(document: DocumentState): readonly DocBlock[] {
  const rootChildIds = document.children[document.rootId] ?? []
  const blocks: DocBlock[] = []

  for (const blockId of rootChildIds) {
    const block = document.blocks[blockId]
    if (block !== undefined) {
      blocks.push(block)
    }
  }

  return blocks
}

function createNoopPasteResult(): PasteResult {
  return {
    handled: false,
    insertedBlockIds: [],
    transactions: [],
  }
}
