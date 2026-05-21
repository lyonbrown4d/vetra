import type { InlineContent } from './inlineContent'

export type BlockId = string

export interface DocumentMeta {
  readonly title?: string
  readonly createdAt?: number
  readonly updatedAt?: number
  readonly [key: string]: unknown
}

export interface DocumentState {
  readonly id: string
  readonly version: number
  readonly rootId: BlockId
  readonly blocks: Readonly<Record<BlockId, DocBlock>>
  readonly children: Readonly<Record<BlockId, readonly BlockId[]>>
  readonly meta?: DocumentMeta
}

export interface DocBlock {
  readonly id: BlockId
  readonly type: string
  readonly props?: Readonly<Record<string, unknown>>
  readonly content?: unknown
  readonly createdAt?: number
  readonly updatedAt?: number
}

export interface RootBlock extends DocBlock {
  readonly type: 'root'
}

export interface ParagraphBlock extends DocBlock {
  readonly type: 'paragraph'
  readonly content: InlineContent
}

export interface HeadingBlock extends DocBlock {
  readonly type: 'heading'
  readonly props: {
    readonly level: 1 | 2 | 3 | 4 | 5 | 6
  }
  readonly content: InlineContent
}

export interface QuoteBlock extends DocBlock {
  readonly type: 'quote'
  readonly content: InlineContent
}

export interface DividerBlock extends DocBlock {
  readonly type: 'divider'
}
