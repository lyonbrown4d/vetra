export interface InlineContent {
  readonly type: 'inline-content'
  readonly version: number
  readonly children: readonly InlineNode[]
}

export type InlineNode = TextInlineNode | LinkInlineNode | MentionInlineNode | InlineCodeNode

export interface TextInlineNode {
  readonly type: 'text'
  readonly text: string
  readonly marks?: readonly InlineMark[]
}

export interface LinkInlineNode {
  readonly type: 'link'
  readonly href: string
  readonly children: readonly InlineNode[]
}

export interface MentionInlineNode {
  readonly type: 'mention'
  readonly id: string
  readonly label: string
}

export interface InlineCodeNode {
  readonly type: 'inline-code'
  readonly text: string
}

export type InlineMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code'

export function createEmptyInlineContent(): InlineContent {
  return {
    type: 'inline-content',
    version: 1,
    children: [],
  }
}

export function createTextInlineContent(text: string): InlineContent {
  if (text.length === 0) {
    return createEmptyInlineContent()
  }

  return {
    type: 'inline-content',
    version: 1,
    children: [{ type: 'text', text }],
  }
}
