import type {
  BlockId,
  DocBlock,
  DocumentState,
  HeadingBlock,
  InlineContent,
  InlineNode,
} from '@vetra/core'

export interface MarkdownExportOptions {
  readonly includeUnknownBlockComments?: boolean
}

type HeadingLevel = HeadingBlock['props']['level']

const defaultExportOptions = {
  includeUnknownBlockComments: true,
} satisfies Required<MarkdownExportOptions>

export function documentToMarkdown(
  document: DocumentState,
  options: MarkdownExportOptions = {},
): string {
  const resolvedOptions = {
    ...defaultExportOptions,
    ...options,
  }

  return collectBlocksInDocumentOrder(document)
    .map((block) => blockToMarkdown(block, resolvedOptions))
    .filter((value) => value.length > 0)
    .join('\n\n')
}

function collectBlocksInDocumentOrder(document: DocumentState): readonly DocBlock[] {
  const blocks: DocBlock[] = []
  const visited = new Set<BlockId>()

  const visit = (blockId: BlockId, includeCurrentBlock: boolean): void => {
    if (visited.has(blockId)) {
      return
    }

    visited.add(blockId)

    const block = document.blocks[blockId]
    if (block === undefined) {
      return
    }

    if (includeCurrentBlock) {
      blocks.push(block)
    }

    for (const childId of document.children[blockId] ?? []) {
      visit(childId, true)
    }
  }

  if (document.blocks[document.rootId] !== undefined) {
    visit(document.rootId, false)
    return blocks
  }

  for (const block of Object.values(document.blocks)) {
    if (block.id !== document.rootId) {
      blocks.push(block)
    }
  }

  return blocks
}

function blockToMarkdown(block: DocBlock, options: Required<MarkdownExportOptions>): string {
  switch (block.type) {
    case 'paragraph':
      return contentToPlainText(block.content)
    case 'heading':
      return headingToMarkdown(block)
    case 'quote':
      return quoteToMarkdown(block)
    case 'divider':
      return '---'
    case 'code':
      return codeToMarkdown(block)
    default:
      return unknownBlockToMarkdown(block, options)
  }
}

function headingToMarkdown(block: DocBlock): string {
  const level = readHeadingLevel(block.props)
  const text = contentToPlainText(block.content).replace(/\s*\n\s*/g, ' ')

  return `${'#'.repeat(level)} ${text}`
}

function readHeadingLevel(props: DocBlock['props']): HeadingLevel {
  const level = props?.level

  return isHeadingLevel(level) ? level : 1
}

function isHeadingLevel(value: unknown): value is HeadingLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6
}

function quoteToMarkdown(block: DocBlock): string {
  const text = contentToPlainText(block.content)

  if (text.length === 0) {
    return '>'
  }

  return text
    .split('\n')
    .map((line) => (line.length === 0 ? '>' : `> ${line}`))
    .join('\n')
}

function codeToMarkdown(block: DocBlock): string {
  const content =
    typeof block.content === 'string' ? block.content : contentToPlainText(block.content)
  const language = readCodeLanguage(block.props)
  const fence = chooseBacktickFence(content)
  const openingFence = language === undefined ? fence : `${fence}${language}`
  const body = content.endsWith('\n') ? content : `${content}\n`

  return `${openingFence}\n${body}${fence}`
}

function readCodeLanguage(props: DocBlock['props']): string | undefined {
  const language = props?.language
  if (typeof language !== 'string') {
    return undefined
  }

  const firstToken = language.trim().split(/\s+/)[0]
  if (firstToken === undefined) {
    return undefined
  }

  const safeToken = firstToken.replace(/[^A-Za-z0-9_+-]/g, '')

  return safeToken.length === 0 ? undefined : safeToken
}

function chooseBacktickFence(content: string): string {
  const maxRun = maxConsecutiveRun(content, '`')

  return '`'.repeat(Math.max(3, maxRun + 1))
}

function maxConsecutiveRun(value: string, target: string): number {
  let currentRun = 0
  let maxRun = 0

  for (const character of value) {
    if (character === target) {
      currentRun += 1
      maxRun = Math.max(maxRun, currentRun)
    } else {
      currentRun = 0
    }
  }

  return maxRun
}

function unknownBlockToMarkdown(block: DocBlock, options: Required<MarkdownExportOptions>): string {
  const text = contentToPlainText(block.content)
  if (text.trim().length > 0) {
    return text
  }

  if (!options.includeUnknownBlockComments) {
    return ''
  }

  return `<!-- Unsupported Vetra block: ${sanitizeCommentValue(block.type)} (${sanitizeCommentValue(
    block.id,
  )}) -->`
}

function contentToPlainText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (isInlineContent(content)) {
    return content.children.map(inlineNodeToPlainText).join('')
  }

  return ''
}

function isInlineContent(value: unknown): value is InlineContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === 'inline-content' &&
    'children' in value &&
    Array.isArray(value.children)
  )
}

function inlineNodeToPlainText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
    case 'inline-code':
      return node.text
    case 'mention':
      return node.label
    case 'link':
      return node.children.map(inlineNodeToPlainText).join('')
  }
}

function sanitizeCommentValue(value: string): string {
  return value.replaceAll('--', '- -').replaceAll('>', '&gt;')
}
