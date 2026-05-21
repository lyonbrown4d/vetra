import {
  createEmptyInlineContent,
  createTextInlineContent,
  type InlineContent,
  type InlineNode,
} from '@vetra/core'

export function inlineContentToPlainText(content: InlineContent): string {
  return content.children.map(inlineNodeToPlainText).join('')
}

export function plainTextToInlineContent(text: string): InlineContent {
  return text.length === 0 ? createEmptyInlineContent() : createTextInlineContent(text)
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
