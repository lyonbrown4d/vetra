import {
  createEmptyInlineContent,
  createTextInlineContent,
  type DividerBlock,
  type HeadingBlock,
  type ParagraphBlock,
  type QuoteBlock,
} from '@vetra/core'
import type { DocBlock, InlineContent } from '@vetra/core'

export interface CodeBlock extends DocBlock {
  readonly type: 'code'
  readonly props?: {
    readonly language?: string
  }
  readonly content: string
}

export type BasicBlock = ParagraphBlock | HeadingBlock | QuoteBlock | DividerBlock | CodeBlock

export function createParagraphBlock(id: string, text = ''): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: text.length === 0 ? createEmptyInlineContent() : createTextInlineContent(text),
  }
}

export function createHeadingBlock(
  id: string,
  level: HeadingBlock['props']['level'],
  text = '',
): HeadingBlock {
  return {
    id,
    type: 'heading',
    props: { level },
    content: text.length === 0 ? createEmptyInlineContent() : createTextInlineContent(text),
  }
}

export function createQuoteBlock(id: string, text = ''): QuoteBlock {
  return {
    id,
    type: 'quote',
    content: text.length === 0 ? createEmptyInlineContent() : createTextInlineContent(text),
  }
}

export function createDividerBlock(id: string): DividerBlock {
  return {
    id,
    type: 'divider',
  }
}

export function createCodeBlock(id: string, content = '', language?: string): CodeBlock {
  return {
    id,
    type: 'code',
    ...(language === undefined ? {} : { props: { language } }),
    content,
  }
}

export function isInlineContent(value: unknown): value is InlineContent {
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
