import type { BlockId, DocBlock, DocumentState, InlineContent, InlineNode } from '@vetra/core'

export interface PlainTextUnknownBlockContext {
  readonly block: DocBlock
  readonly depth: number
  readonly document: DocumentState
}

export type PlainTextUnknownBlockFallback = (context: PlainTextUnknownBlockContext) => string

export interface PlainTextExportOptions {
  readonly blockSeparator?: string
  readonly unknownBlockFallback?: PlainTextUnknownBlockFallback
}

interface ResolvedPlainTextExportOptions {
  readonly blockSeparator: string
  readonly unknownBlockFallback: PlainTextUnknownBlockFallback
}

const DEFAULT_BLOCK_SEPARATOR = '\n\n'

export function documentToPlainText(
  document: DocumentState,
  options: PlainTextExportOptions = {},
): string {
  const resolvedOptions: ResolvedPlainTextExportOptions = {
    blockSeparator: options.blockSeparator ?? DEFAULT_BLOCK_SEPARATOR,
    unknownBlockFallback: options.unknownBlockFallback ?? defaultUnknownBlockFallback,
  }

  return collectPlainTextBlocks(document, document.rootId, 0, resolvedOptions).join(
    resolvedOptions.blockSeparator,
  )
}

export function blockToPlainText(
  block: DocBlock,
  context: PlainTextUnknownBlockContext,
  unknownBlockFallback: PlainTextUnknownBlockFallback = defaultUnknownBlockFallback,
): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return blockContentToPlainText(block.content)
    case 'code':
      return typeof block.content === 'string' ? block.content : ''
    case 'divider':
      return '---'
    case 'image':
      return imageBlockToPlainText(block)
    default:
      return unknownBlockFallback(context)
  }
}

export function inlineContentToPlainText(content: InlineContent): string {
  return content.children.map((child) => inlineNodeToPlainText(child)).join('')
}

export const defaultUnknownBlockFallback: PlainTextUnknownBlockFallback = ({ block }) => {
  const contentText = blockContentToPlainText(block.content)

  if (contentText.length > 0) {
    return contentText
  }

  const propsText = blockPropsToPlainText(block.props)

  if (propsText.length > 0) {
    return propsText
  }

  return `[unsupported block: ${block.type}]`
}

function collectPlainTextBlocks(
  document: DocumentState,
  parentId: BlockId,
  depth: number,
  options: ResolvedPlainTextExportOptions,
): string[] {
  const childIds = document.children[parentId] ?? []
  const output: string[] = []

  for (const blockId of childIds) {
    const block = document.blocks[blockId]

    if (block === undefined) {
      continue
    }

    output.push(
      blockToPlainText(block, { block, depth, document }, options.unknownBlockFallback),
      ...collectPlainTextBlocks(document, block.id, depth + 1, options),
    )
  }

  return output
}

function inlineNodeToPlainText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return node.text
    case 'link':
      return node.children.map((child) => inlineNodeToPlainText(child)).join('')
    case 'mention':
      return node.label
    case 'inline-code':
      return node.text
  }
}

function blockContentToPlainText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (isInlineContentLike(content)) {
    return content.children.map((child) => unknownInlineNodeToPlainText(child)).join('')
  }

  return ''
}

function unknownInlineNodeToPlainText(node: unknown): string {
  if (!isRecord(node)) {
    return ''
  }

  switch (node.type) {
    case 'text':
    case 'inline-code':
      return typeof node.text === 'string' ? node.text : ''
    case 'link':
      return Array.isArray(node.children)
        ? node.children.map((child) => unknownInlineNodeToPlainText(child)).join('')
        : ''
    case 'mention':
      if (typeof node.label === 'string') {
        return node.label
      }

      return typeof node.id === 'string' ? node.id : ''
    default:
      return ''
  }
}

function imageBlockToPlainText(block: DocBlock): string {
  const props = block.props

  if (props === undefined) {
    return ''
  }

  const alt = stringProp(props, 'alt')

  if (alt.length > 0) {
    return alt
  }

  const caption = blockContentToPlainText(props.caption)

  if (caption.length > 0) {
    return caption
  }

  return stringProp(props, 'src')
}

function blockPropsToPlainText(props: DocBlock['props']): string {
  if (props === undefined) {
    return ''
  }

  const caption = blockContentToPlainText(props.caption)

  if (caption.length > 0) {
    return caption
  }

  for (const key of ['title', 'label', 'alt', 'src'] as const) {
    const value = stringProp(props, key)

    if (value.length > 0) {
      return value
    }
  }

  return ''
}

function stringProp(props: Readonly<Record<string, unknown>>, key: string): string {
  const value = props[key]

  return typeof value === 'string' ? value : ''
}

function isInlineContentLike(value: unknown): value is { readonly children: readonly unknown[] } {
  return isRecord(value) && value.type === 'inline-content' && Array.isArray(value.children)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
