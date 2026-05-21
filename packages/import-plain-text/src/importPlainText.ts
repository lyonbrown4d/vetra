import { createDocument, createTextInlineContent } from '@vetra/core'
import type {
  BlockId,
  CreateDocumentOptions,
  DocumentMeta,
  DocumentState,
  ParagraphBlock,
} from '@vetra/core'

export type PlainTextSplitStrategy = 'line' | 'paragraph'

export interface PlainTextBlockIdContext {
  readonly index: number
  readonly text: string
  readonly splitBy: PlainTextSplitStrategy
}

export type PlainTextBlockIdFactory = (context: PlainTextBlockIdContext) => BlockId

export interface PlainTextImportOptions {
  readonly splitBy?: PlainTextSplitStrategy
  readonly documentId?: string
  readonly rootId?: BlockId
  readonly idFactory?: PlainTextBlockIdFactory
  readonly meta?: DocumentMeta
}

const DEFAULT_DOCUMENT_ID = 'plain-text-document'

export const defaultPlainTextBlockIdFactory: PlainTextBlockIdFactory = ({ index }) =>
  `plain-text-block-${String(index + 1)}`

export function plainTextToDocument(
  text: string,
  options: PlainTextImportOptions = {},
): DocumentState {
  const splitBy = options.splitBy ?? 'paragraph'
  const idFactory = options.idFactory ?? defaultPlainTextBlockIdFactory
  const blockTexts = splitPlainText(text, splitBy)
  const blocks = blockTexts.map((blockText, index): ParagraphBlock => {
    return {
      id: idFactory({ index, text: blockText, splitBy }),
      type: 'paragraph',
      content: createTextInlineContent(blockText),
    }
  })

  assertValidImportedBlockIds(blocks, options.rootId ?? 'root')

  const documentOptions: CreateDocumentOptions = {
    id: options.documentId ?? DEFAULT_DOCUMENT_ID,
    blocks,
    ...(options.rootId === undefined ? {} : { rootId: options.rootId }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  }

  return createDocument(documentOptions)
}

export function splitPlainText(
  text: string,
  splitBy: PlainTextSplitStrategy = 'paragraph',
): readonly string[] {
  const normalizedText = normalizePlainTextLineEndings(text)

  if (splitBy === 'line') {
    return normalizedText.split('\n')
  }

  return splitPlainTextParagraphs(normalizedText)
}

export function normalizePlainTextLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function splitPlainTextParagraphs(text: string): readonly string[] {
  if (text.length === 0) {
    return ['']
  }

  const paragraphs: string[] = []
  let currentParagraphLines: string[] = []

  for (const line of text.split('\n')) {
    if (line.trim().length === 0) {
      pushCurrentParagraph(paragraphs, currentParagraphLines)
      currentParagraphLines = []
      continue
    }

    currentParagraphLines.push(line)
  }

  pushCurrentParagraph(paragraphs, currentParagraphLines)

  return paragraphs.length === 0 ? [''] : paragraphs
}

function pushCurrentParagraph(
  paragraphs: string[],
  currentParagraphLines: readonly string[],
): void {
  if (currentParagraphLines.length === 0) {
    return
  }

  paragraphs.push(currentParagraphLines.join('\n'))
}

function assertValidImportedBlockIds(blocks: readonly ParagraphBlock[], rootId: BlockId): void {
  const seenBlockIds = new Set<BlockId>()

  for (const block of blocks) {
    if (block.id === rootId) {
      throw new Error(`Plain text import produced block id "${block.id}" that conflicts with root.`)
    }

    if (seenBlockIds.has(block.id)) {
      throw new Error(`Plain text import produced duplicate block id "${block.id}".`)
    }

    seenBlockIds.add(block.id)
  }
}
