import type { ReactNode } from 'react'
import { LexicalBlockEditor } from '@vetra/lexical'
import { defineReactBlock, type AnyReactBlockPlugin, type BlockRendererProps } from '@vetra/react'
import type {
  DividerBlock,
  DocBlock,
  DocumentState,
  HeadingBlock,
  InlineContent,
  InlineMark,
  InlineNode,
  ParagraphBlock,
  QuoteBlock,
} from '@vetra/core'
import { createEmptyInlineContent, findParentId, getBlockChildren } from '@vetra/core'
import { isInlineContent, type CodeBlock } from './blocks'

export const basicBlocks: readonly AnyReactBlockPlugin[] = [
  defineReactBlock<ParagraphBlock>({
    type: 'paragraph',
    readonlyRenderer: ParagraphReadonly,
    activeRenderer: RichTextActive,
  }),
  defineReactBlock<HeadingBlock>({
    type: 'heading',
    readonlyRenderer: HeadingReadonly,
    activeRenderer: RichTextActive,
  }),
  defineReactBlock<QuoteBlock>({
    type: 'quote',
    readonlyRenderer: QuoteReadonly,
    activeRenderer: RichTextActive,
  }),
  defineReactBlock<CodeBlock>({
    type: 'code',
    readonlyRenderer: CodeReadonly,
    activeRenderer: CodeActive,
  }),
  defineReactBlock<DividerBlock>({
    type: 'divider',
    readonlyRenderer: DividerReadonly,
  }),
]

function ParagraphReadonly(props: BlockRendererProps<ParagraphBlock>) {
  return (
    <div className="vetra-block vetra-block--paragraph" data-block-id={props.block.id}>
      {renderInlineContent(props.block.content)}
    </div>
  )
}

function HeadingReadonly(props: BlockRendererProps<HeadingBlock>) {
  return (
    <div className="vetra-block vetra-block--heading" data-block-id={props.block.id}>
      {renderHeading(props.block.props.level, renderInlineContent(props.block.content))}
    </div>
  )
}

function QuoteReadonly(props: BlockRendererProps<QuoteBlock>) {
  return (
    <div className="vetra-block vetra-block--quote" data-block-id={props.block.id}>
      <blockquote>{renderInlineContent(props.block.content)}</blockquote>
    </div>
  )
}

function DividerReadonly(props: BlockRendererProps<DividerBlock>) {
  return (
    <div className="vetra-block vetra-block--divider" data-block-id={props.block.id}>
      <hr />
    </div>
  )
}

function CodeReadonly(props: BlockRendererProps<CodeBlock>) {
  return (
    <div className="vetra-block vetra-block--code" data-block-id={props.block.id}>
      <pre>
        <code>{props.block.content}</code>
      </pre>
    </div>
  )
}

function RichTextActive(props: BlockRendererProps<ParagraphBlock | HeadingBlock | QuoteBlock>) {
  const value = isInlineContent(props.block.content)
    ? props.block.content
    : createEmptyInlineContent()

  return (
    <div className="vetra-block vetra-block--active" data-block-id={props.block.id}>
      <LexicalBlockEditor
        autoFocus
        className="vetra-inline-editor"
        onChange={(nextValue) => {
          updateRichTextBlockContent(props, nextValue)
        }}
        onCommit={(commit) => {
          updateRichTextBlockContent(props, commit.content)
        }}
        onMergeBlockBackward={(intent) => {
          const previousBlock = findPreviousSiblingBlock(
            props.editor.getState().document,
            props.block.id,
          )

          if (previousBlock === undefined || !isInlineContent(previousBlock.content)) {
            return
          }

          const result = props.editor.dispatch({
            type: 'mergeBlock',
            targetBlockId: previousBlock.id,
            sourceBlockId: props.block.id,
            mergedContent: mergeInlineContent(previousBlock.content, intent.content),
          })
          if (result.ok) {
            props.editor.dispatch({
              type: 'setSelection',
              selection: { type: 'block', blockId: previousBlock.id },
            })
          }
        }}
        onSplitBlock={(intent) => {
          const afterBlockId = createNextBlockId(props.editor.getState().document, props.block.id)
          const result = props.editor.dispatch({
            type: 'splitBlock',
            blockId: props.block.id,
            beforeContent: intent.before,
            afterBlock: {
              ...props.block,
              id: afterBlockId,
              content: intent.after,
            },
          })
          if (result.ok) {
            props.editor.dispatch({
              type: 'setSelection',
              selection: { type: 'block', blockId: afterBlockId },
            })
          }
        }}
        placeholder="Type..."
        value={value}
      />
    </div>
  )
}

function updateRichTextBlockContent(
  props: BlockRendererProps<ParagraphBlock | HeadingBlock | QuoteBlock>,
  nextValue: InlineContent,
): void {
  if (props.block.content === nextValue) {
    return
  }

  props.editor.dispatch({
    type: 'updateBlock',
    blockId: props.block.id,
    patch: { content: nextValue },
  })
}

function findPreviousSiblingBlock(document: DocumentState, blockId: string): DocBlock | undefined {
  const parentId = findParentId(document, blockId)

  if (parentId === undefined) {
    return undefined
  }

  const siblings = getBlockChildren(document, parentId)
  const blockIndex = siblings.indexOf(blockId)

  if (blockIndex <= 0) {
    return undefined
  }

  const previousBlockId = siblings[blockIndex - 1]

  return previousBlockId === undefined ? undefined : document.blocks[previousBlockId]
}

function mergeInlineContent(left: InlineContent, right: InlineContent): InlineContent {
  const children = [...left.children, ...right.children]

  return children.length === 0
    ? createEmptyInlineContent()
    : {
        type: 'inline-content',
        version: Math.max(left.version, right.version),
        children,
      }
}

function createNextBlockId(document: DocumentState, blockId: string): string {
  let candidate = `${blockId}-${createRandomIdSegment()}`

  while (document.blocks[candidate] !== undefined) {
    candidate = `${blockId}-${createRandomIdSegment()}`
  }

  return candidate
}

function createRandomIdSegment(): string {
  return globalThis.crypto.randomUUID()
}

function CodeActive(props: BlockRendererProps<CodeBlock>) {
  return (
    <div
      className="vetra-block vetra-block--active vetra-block--code"
      data-block-id={props.block.id}
    >
      <textarea
        aria-label="Code block"
        className="vetra-code-editor"
        onChange={(event) => {
          props.editor.dispatch({
            type: 'updateBlock',
            blockId: props.block.id,
            patch: { content: event.currentTarget.value },
          })
        }}
        value={props.block.content}
      />
    </div>
  )
}

function renderInlineContent(content: InlineContent): ReactNode {
  if (content.children.length === 0) {
    return <span className="vetra-inline-placeholder">Empty</span>
  }

  return content.children.map((node, index) => renderInlineNode(node, String(index)))
}

function renderHeading(level: HeadingBlock['props']['level'], children: ReactNode): ReactNode {
  switch (level) {
    case 1:
      return <h1>{children}</h1>
    case 2:
      return <h2>{children}</h2>
    case 3:
      return <h3>{children}</h3>
    case 4:
      return <h4>{children}</h4>
    case 5:
      return <h5>{children}</h5>
    case 6:
      return <h6>{children}</h6>
  }
}

function renderInlineNode(node: InlineNode, key: string): ReactNode {
  switch (node.type) {
    case 'text':
      return applyMarks(node.text, node.marks ?? [], key)
    case 'inline-code':
      return <code key={key}>{node.text}</code>
    case 'mention':
      return (
        <span className="vetra-mention" key={key}>
          {node.label}
        </span>
      )
    case 'link':
      return (
        <a href={node.href} key={key}>
          {node.children.map((child, index) => renderInlineNode(child, `${key}.${String(index)}`))}
        </a>
      )
  }
}

function applyMarks(text: string, marks: readonly InlineMark[], key: string): ReactNode {
  let node: ReactNode = text

  for (const mark of marks) {
    switch (mark) {
      case 'bold':
        node = <strong key={`${key}.bold`}>{node}</strong>
        break
      case 'italic':
        node = <em key={`${key}.italic`}>{node}</em>
        break
      case 'underline':
        node = <u key={`${key}.underline`}>{node}</u>
        break
      case 'strike':
        node = <s key={`${key}.strike`}>{node}</s>
        break
      case 'code':
        node = <code key={`${key}.code`}>{node}</code>
        break
    }
  }

  return <span key={key}>{node}</span>
}
