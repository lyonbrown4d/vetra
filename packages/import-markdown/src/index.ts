import {
  createDocument,
  createTextInlineContent,
  type BlockId,
  type DividerBlock,
  type DocBlock,
  type DocumentState,
  type HeadingBlock,
  type ParagraphBlock,
  type QuoteBlock,
} from '@vetra/core'

export interface MarkdownCodeBlock extends DocBlock {
  readonly type: 'code'
  readonly props?: {
    readonly language?: string
  }
  readonly content: string
}

export type MarkdownImportedBlock =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | DividerBlock
  | MarkdownCodeBlock

export interface MarkdownImportBlockIdContext {
  readonly blockType: MarkdownImportedBlock['type']
  readonly ordinal: number
  readonly sourceLine: number
}

export type MarkdownBlockIdGenerator = (context: MarkdownImportBlockIdContext) => BlockId

export interface MarkdownToDocumentOptions {
  readonly documentId?: string
  readonly rootId?: BlockId
  readonly generateBlockId?: MarkdownBlockIdGenerator
  readonly meta?: DocumentState['meta']
}

interface FenceOpening {
  readonly marker: '`' | '~'
  readonly length: number
  readonly language?: string
}

const defaultDocumentId = 'markdown-document'

export function markdownToDocument(
  markdown: string,
  options: MarkdownToDocumentOptions = {},
): DocumentState {
  const lines = normalizeLineEndings(markdown).split('\n')
  const generateBlockId = options.generateBlockId ?? defaultGenerateBlockId
  const blocks: MarkdownImportedBlock[] = []
  let lineIndex = 0

  const nextBlockId = (blockType: MarkdownImportedBlock['type'], sourceLine: number): BlockId => {
    return generateBlockId({
      blockType,
      ordinal: blocks.length + 1,
      sourceLine,
    })
  }

  while (lineIndex < lines.length) {
    const line = lines[lineIndex] ?? ''

    if (isBlankLine(line)) {
      lineIndex += 1
      continue
    }

    const fenceOpening = parseFenceOpening(line)
    if (fenceOpening !== undefined) {
      const sourceLine = lineIndex + 1
      const codeLines: string[] = []
      lineIndex += 1

      while (lineIndex < lines.length) {
        const codeLine = lines[lineIndex] ?? ''
        if (isFenceClosing(codeLine, fenceOpening)) {
          lineIndex += 1
          break
        }

        codeLines.push(codeLine)
        lineIndex += 1
      }

      blocks.push(
        createCodeBlock(
          nextBlockId('code', sourceLine),
          codeLines.join('\n'),
          fenceOpening.language,
        ),
      )
      continue
    }

    const heading = parseHeading(line)
    if (heading !== undefined) {
      const sourceLine = lineIndex + 1
      blocks.push(
        createHeadingBlock(nextBlockId('heading', sourceLine), heading.level, heading.text),
      )
      lineIndex += 1
      continue
    }

    if (isDivider(line)) {
      const sourceLine = lineIndex + 1
      blocks.push(createDividerBlock(nextBlockId('divider', sourceLine)))
      lineIndex += 1
      continue
    }

    if (isQuoteLine(line)) {
      const sourceLine = lineIndex + 1
      const quoteLines: string[] = []

      while (lineIndex < lines.length) {
        const quoteLine = lines[lineIndex] ?? ''
        if (!isQuoteLine(quoteLine)) {
          break
        }

        quoteLines.push(stripQuoteMarker(quoteLine))
        lineIndex += 1
      }

      blocks.push(createQuoteBlock(nextBlockId('quote', sourceLine), quoteLines.join('\n')))
      continue
    }

    const sourceLine = lineIndex + 1
    const paragraphLines: string[] = []

    while (lineIndex < lines.length) {
      const paragraphLine = lines[lineIndex] ?? ''
      if (
        isBlankLine(paragraphLine) ||
        parseFenceOpening(paragraphLine) !== undefined ||
        parseHeading(paragraphLine) !== undefined ||
        isDivider(paragraphLine) ||
        isQuoteLine(paragraphLine)
      ) {
        break
      }

      paragraphLines.push(paragraphLine.trimEnd())
      lineIndex += 1
    }

    blocks.push(
      createParagraphBlock(nextBlockId('paragraph', sourceLine), paragraphLines.join('\n')),
    )
  }

  const rootId = options.rootId ?? 'root'
  assertValidImportedBlockIds(blocks, rootId)

  return createDocument({
    id: options.documentId ?? defaultDocumentId,
    ...(options.rootId === undefined ? {} : { rootId }),
    blocks,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  })
}

function defaultGenerateBlockId(context: MarkdownImportBlockIdContext): BlockId {
  return `md-${String(context.ordinal)}`
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function isBlankLine(line: string): boolean {
  return line.trim().length === 0
}

function parseFenceOpening(line: string): FenceOpening | undefined {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line)
  if (match === null) {
    return undefined
  }

  const fence = match[2]
  if (fence === undefined) {
    return undefined
  }

  const marker = fence[0]
  if (marker !== '`' && marker !== '~') {
    return undefined
  }

  const rawInfo = match[3]?.trim() ?? ''
  const language = rawInfo.length === 0 ? undefined : rawInfo.split(/\s+/)[0]

  return {
    marker,
    length: fence.length,
    ...(language === undefined ? {} : { language }),
  }
}

function isFenceClosing(line: string, opening: FenceOpening): boolean {
  const trimmed = line.trim()
  let markerCount = 0

  while (trimmed[markerCount] === opening.marker) {
    markerCount += 1
  }

  return markerCount >= opening.length && trimmed.slice(markerCount).trim().length === 0
}

function parseHeading(
  line: string,
): { readonly level: HeadingBlock['props']['level']; readonly text: string } | undefined {
  const match = /^(#{1,6})[ \t]+(.+)$/.exec(line.trimEnd())
  const markers = match?.[1]
  const rawText = match?.[2]

  if (markers === undefined || rawText === undefined) {
    return undefined
  }

  return {
    level: markers.length as HeadingBlock['props']['level'],
    text: rawText.replace(/[ \t]+#+[ \t]*$/, '').trim(),
  }
}

function isDivider(line: string): boolean {
  return /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)
}

function isQuoteLine(line: string): boolean {
  return /^ {0,3}>/.test(line)
}

function stripQuoteMarker(line: string): string {
  return line.replace(/^ {0,3}>[ \t]?/, '')
}

function createParagraphBlock(id: BlockId, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function createHeadingBlock(
  id: BlockId,
  level: HeadingBlock['props']['level'],
  text: string,
): HeadingBlock {
  return {
    id,
    type: 'heading',
    props: { level },
    content: createTextInlineContent(text),
  }
}

function createQuoteBlock(id: BlockId, text: string): QuoteBlock {
  return {
    id,
    type: 'quote',
    content: createTextInlineContent(text),
  }
}

function createDividerBlock(id: BlockId): DividerBlock {
  return {
    id,
    type: 'divider',
  }
}

function createCodeBlock(id: BlockId, content: string, language?: string): MarkdownCodeBlock {
  return {
    id,
    type: 'code',
    ...(language === undefined ? {} : { props: { language } }),
    content,
  }
}

function assertValidImportedBlockIds(
  blocks: readonly MarkdownImportedBlock[],
  rootId: BlockId,
): void {
  const seenBlockIds = new Set<BlockId>()

  for (const block of blocks) {
    if (block.id === rootId) {
      throw new Error(`Markdown import produced block id "${block.id}" that conflicts with root.`)
    }

    if (seenBlockIds.has(block.id)) {
      throw new Error(`Markdown import produced duplicate block id "${block.id}".`)
    }

    seenBlockIds.add(block.id)
  }
}
