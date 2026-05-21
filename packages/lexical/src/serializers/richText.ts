import {
  createEmptyInlineContent,
  type InlineContent,
  type InlineMark,
  type InlineNode,
} from '@vetra/core'

export interface LexicalAdapterState {
  readonly root: LexicalAdapterRootNode
}

export interface LexicalAdapterRootNode {
  readonly type: 'root'
  readonly children: readonly LexicalAdapterParagraphNode[]
  readonly direction: null
  readonly format: ''
  readonly indent: 0
  readonly version: 1
}

export interface LexicalAdapterParagraphNode {
  readonly type: 'paragraph'
  readonly children: readonly LexicalAdapterTextNode[]
  readonly direction: null
  readonly format: ''
  readonly indent: 0
  readonly textFormat: 0
  readonly textStyle: ''
  readonly version: 1
}

export interface LexicalAdapterTextNode {
  readonly type: 'text'
  readonly detail: 0
  readonly format: number
  readonly mode: 'normal'
  readonly style: ''
  readonly text: string
  readonly version: 1
}

const lexicalTextFormatByInlineMark = {
  bold: 1,
  italic: 2,
  strike: 4,
  underline: 8,
  code: 16,
} satisfies Record<InlineMark, number>

const inlineMarkOrder = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
] as const satisfies readonly InlineMark[]

export function inlineContentToLexicalAdapterState(content: InlineContent): LexicalAdapterState {
  return createLexicalAdapterState(content.children.flatMap(inlineNodeToLexicalTextNodes))
}

export function lexicalAdapterStateToInlineContent(state: LexicalAdapterState): InlineContent {
  const children = state.root.children.flatMap((paragraph) =>
    paragraph.children.flatMap(lexicalTextNodeToInlineNodes),
  )

  return children.length === 0
    ? createEmptyInlineContent()
    : {
        type: 'inline-content',
        version: 1,
        children,
      }
}

export function createLexicalAdapterState(
  textNodes: readonly LexicalAdapterTextNode[] = [],
): LexicalAdapterState {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: textNodes,
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

export function createLexicalAdapterTextNode(text: string, format = 0): LexicalAdapterTextNode {
  return {
    type: 'text',
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text,
    version: 1,
  }
}

export function inlineMarksToLexicalTextFormat(marks: readonly InlineMark[] = []): number {
  let format = 0

  for (const mark of marks) {
    format |= lexicalTextFormatByInlineMark[mark]
  }

  return format
}

export function lexicalTextFormatToInlineMarks(format: number): readonly InlineMark[] {
  const marks: InlineMark[] = []

  for (const mark of inlineMarkOrder) {
    if ((format & lexicalTextFormatByInlineMark[mark]) !== 0) {
      marks.push(mark)
    }
  }

  return marks
}

function inlineNodeToLexicalTextNodes(node: InlineNode): readonly LexicalAdapterTextNode[] {
  switch (node.type) {
    case 'text':
      return textToLexicalTextNodes(node.text, inlineMarksToLexicalTextFormat(node.marks ?? []))
    case 'inline-code':
      return textToLexicalTextNodes(node.text, inlineMarksToLexicalTextFormat(['code']))
    case 'mention':
      return textToLexicalTextNodes(node.label)
    case 'link':
      return node.children.flatMap(inlineNodeToLexicalTextNodes)
  }
}

function lexicalTextNodeToInlineNodes(node: LexicalAdapterTextNode): readonly InlineNode[] {
  if (node.text.length === 0) {
    return []
  }

  const marks = lexicalTextFormatToInlineMarks(node.format)

  return [
    {
      type: 'text',
      text: node.text,
      ...(marks.length === 0 ? {} : { marks }),
    },
  ]
}

function textToLexicalTextNodes(text: string, format = 0): readonly LexicalAdapterTextNode[] {
  return text.length === 0 ? [] : [createLexicalAdapterTextNode(text, format)]
}
