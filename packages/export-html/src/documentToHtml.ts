import type { BlockId, DocBlock, DocumentState, HeadingBlock, InlineMark } from '@vetra/core'

export interface HtmlExportOptions {
  readonly includeUnknownBlockComments?: boolean
}

interface ResolvedHtmlExportOptions {
  readonly includeUnknownBlockComments: boolean
}

type HeadingLevel = HeadingBlock['props']['level']

const defaultExportOptions = {
  includeUnknownBlockComments: true,
} satisfies Required<HtmlExportOptions>

const inlineMarkTags: Readonly<
  Record<InlineMark, { readonly open: string; readonly close: string }>
> = {
  bold: { open: '<strong>', close: '</strong>' },
  italic: { open: '<em>', close: '</em>' },
  underline: { open: '<u>', close: '</u>' },
  strike: { open: '<s>', close: '</s>' },
  code: { open: '<code>', close: '</code>' },
}

const safeHrefProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export function documentToHtml(document: DocumentState, options: HtmlExportOptions = {}): string {
  const resolvedOptions: ResolvedHtmlExportOptions = {
    ...defaultExportOptions,
    ...options,
  }

  return collectBlocksInDocumentOrder(document)
    .map((block) => blockToHtml(block, resolvedOptions))
    .filter((value) => value.length > 0)
    .join('\n')
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

function blockToHtml(block: DocBlock, options: ResolvedHtmlExportOptions): string {
  switch (block.type) {
    case 'paragraph':
      return `<p>${blockContentToHtml(block.content)}</p>`
    case 'heading':
      return headingToHtml(block)
    case 'quote':
      return `<blockquote>${blockContentToHtml(block.content)}</blockquote>`
    case 'divider':
      return '<hr>'
    case 'code':
      return codeToHtml(block)
    default:
      return unknownBlockToHtml(block, options)
  }
}

function headingToHtml(block: DocBlock): string {
  const level = readHeadingLevel(block.props)

  return `<h${String(level)}>${blockContentToHtml(block.content)}</h${String(level)}>`
}

function readHeadingLevel(props: DocBlock['props']): HeadingLevel {
  const level = props?.level

  return isHeadingLevel(level) ? level : 1
}

function isHeadingLevel(value: unknown): value is HeadingLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6
}

function codeToHtml(block: DocBlock): string {
  const code =
    typeof block.content === 'string' ? block.content : blockContentToPlainText(block.content)
  const language = readCodeLanguage(block.props)
  const classAttribute =
    language === undefined ? '' : ` class="language-${escapeHtmlAttribute(language)}"`

  return `<pre><code${classAttribute}>${escapeHtmlText(code)}</code></pre>`
}

function readCodeLanguage(props: DocBlock['props']): string | undefined {
  const rawLanguage = props?.language
  if (typeof rawLanguage !== 'string') {
    return undefined
  }

  const firstToken = rawLanguage.trim().split(/\s+/)[0]
  if (firstToken === undefined) {
    return undefined
  }

  const safeToken = firstToken.replace(/[^A-Za-z0-9_+-]/g, '')

  return safeToken.length === 0 ? undefined : safeToken
}

function unknownBlockToHtml(block: DocBlock, options: ResolvedHtmlExportOptions): string {
  const html = blockContentToHtml(block.content)
  const text = blockContentToPlainText(block.content)

  if (text.trim().length > 0) {
    return `<p data-vetra-unsupported-block="${escapeHtmlAttribute(block.type)}">${html}</p>`
  }

  if (!options.includeUnknownBlockComments) {
    return ''
  }

  return `<!-- Unsupported Vetra block: ${sanitizeHtmlComment(block.type)} (${sanitizeHtmlComment(
    block.id,
  )}) -->`
}

function blockContentToHtml(content: unknown): string {
  if (typeof content === 'string') {
    return escapeHtmlText(content)
  }

  if (isInlineContentLike(content)) {
    return content.children.map((child) => inlineNodeToHtml(child)).join('')
  }

  return ''
}

function inlineNodeToHtml(node: unknown): string {
  if (!isRecord(node)) {
    return ''
  }

  switch (node.type) {
    case 'text':
      return textNodeToHtml(node)
    case 'link':
      return linkNodeToHtml(node)
    case 'mention':
      return escapeHtmlText(mentionNodeToText(node))
    case 'inline-code':
      return `<code>${escapeHtmlText(stringProp(node, 'text'))}</code>`
    default:
      return ''
  }
}

function textNodeToHtml(node: Readonly<Record<string, unknown>>): string {
  const text = escapeHtmlText(stringProp(node, 'text'))
  const marks = inlineMarksFromUnknown(node.marks)

  return applyInlineMarks(text, marks)
}

function linkNodeToHtml(node: Readonly<Record<string, unknown>>): string {
  const children = Array.isArray(node.children)
    ? node.children.map((child) => inlineNodeToHtml(child)).join('')
    : ''
  const href = stringProp(node, 'href')
  const safeHref = sanitizeHref(href)

  if (safeHref === undefined) {
    return children
  }

  return `<a href="${escapeHtmlAttribute(safeHref)}">${children}</a>`
}

function mentionNodeToText(node: Readonly<Record<string, unknown>>): string {
  const label = stringProp(node, 'label')

  return label.length > 0 ? label : stringProp(node, 'id')
}

function applyInlineMarks(html: string, marks: readonly InlineMark[]): string {
  let output = html

  for (const mark of [...marks].reverse()) {
    const tag = inlineMarkTags[mark]
    output = `${tag.open}${output}${tag.close}`
  }

  return output
}

function inlineMarksFromUnknown(value: unknown): readonly InlineMark[] {
  if (!Array.isArray(value)) {
    return []
  }

  const marks: InlineMark[] = []

  for (const mark of value) {
    if (isInlineMark(mark) && !marks.includes(mark)) {
      marks.push(mark)
    }
  }

  return marks
}

function isInlineMark(value: unknown): value is InlineMark {
  return (
    value === 'bold' ||
    value === 'italic' ||
    value === 'underline' ||
    value === 'strike' ||
    value === 'code'
  )
}

function blockContentToPlainText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (isInlineContentLike(content)) {
    return content.children.map((child) => inlineNodeToPlainText(child)).join('')
  }

  return ''
}

function inlineNodeToPlainText(node: unknown): string {
  if (!isRecord(node)) {
    return ''
  }

  switch (node.type) {
    case 'text':
    case 'inline-code':
      return stringProp(node, 'text')
    case 'mention':
      return mentionNodeToText(node)
    case 'link':
      return Array.isArray(node.children)
        ? node.children.map((child) => inlineNodeToPlainText(child)).join('')
        : ''
    default:
      return ''
  }
}

function sanitizeHref(href: string): string | undefined {
  const trimmed = href.trim()

  if (trimmed.length === 0) {
    return undefined
  }

  const protocol = readUrlProtocol(trimmed)
  if (protocol !== undefined && !safeHrefProtocols.has(protocol)) {
    return undefined
  }

  return trimmed
}

function readUrlProtocol(value: string): string | undefined {
  const compactValue = removeControlAndWhitespace(value)
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(compactValue)
  const protocol = match?.[1]

  return protocol === undefined ? undefined : `${protocol.toLowerCase()}:`
}

function removeControlAndWhitespace(value: string): string {
  let output = ''

  for (const character of value) {
    if (!isControlOrWhitespace(character)) {
      output += character
    }
  }

  return output
}

function isControlOrWhitespace(character: string): boolean {
  const code = character.charCodeAt(0)

  return code <= 31 || code === 127 || character.trim().length === 0
}

function isInlineContentLike(value: unknown): value is { readonly children: readonly unknown[] } {
  return isRecord(value) && value.type === 'inline-content' && Array.isArray(value.children)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringProp(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

function escapeHtmlText(value: string): string {
  return value.replace(/[&<>]/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      default:
        return character
    }
  })
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}

function sanitizeHtmlComment(value: string): string {
  return value
    .replaceAll('--', '- -')
    .replace(/[<>]/g, (character) => (character === '<' ? '&lt;' : '&gt;'))
}
