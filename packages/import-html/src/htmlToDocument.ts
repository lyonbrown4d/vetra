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

export interface HtmlCodeBlock extends DocBlock {
  readonly type: 'code'
  readonly props?: {
    readonly language?: string
  }
  readonly content: string
}

export type HtmlImportedBlock =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | DividerBlock
  | HtmlCodeBlock

export interface HtmlImportBlockIdContext {
  readonly blockType: HtmlImportedBlock['type']
  readonly ordinal: number
  readonly sourceTag: string
}

export type HtmlBlockIdGenerator = (context: HtmlImportBlockIdContext) => BlockId

export interface HtmlToDocumentOptions {
  readonly documentId?: string
  readonly rootId?: BlockId
  readonly generateBlockId?: HtmlBlockIdGenerator
  readonly meta?: DocumentState['meta']
}

interface ImportState {
  readonly generateBlockId: HtmlBlockIdGenerator
  readonly blocks: HtmlImportedBlock[]
}

const defaultDocumentId = 'html-document'
const textNode = 3
const elementNode = 1

const dangerousTags = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'object',
  'embed',
])

const containerTags = new Set([
  'address',
  'article',
  'aside',
  'body',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

const readableTextBoundaryTags = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

const blockDescendantSelector = [
  'blockquote',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'p',
  'pre',
].join(',')

export function htmlToDocument(html: string, options: HtmlToDocumentOptions = {}): DocumentState {
  const parser = createDomParser()
  const parsedDocument = parser.parseFromString(html, 'text/html')
  const state: ImportState = {
    generateBlockId: options.generateBlockId ?? defaultGenerateBlockId,
    blocks: [],
  }

  appendBlocksFromChildren(parsedDocument.body, state)

  const rootId = options.rootId ?? 'root'
  assertValidImportedBlockIds(state.blocks, rootId)

  return createDocument({
    id: options.documentId ?? defaultDocumentId,
    ...(options.rootId === undefined ? {} : { rootId }),
    blocks: state.blocks,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  })
}

function defaultGenerateBlockId(context: HtmlImportBlockIdContext): BlockId {
  return `html-${String(context.ordinal)}`
}

function createDomParser(): DOMParser {
  if (typeof DOMParser === 'undefined') {
    throw new Error('HTML import requires a DOMParser-compatible runtime.')
  }

  return new DOMParser()
}

function appendBlocksFromChildren(parent: Node, state: ImportState): void {
  const inlineParts: string[] = []
  let inlineSourceTag: string | undefined

  const appendInlineText = (text: string, sourceTag: string): void => {
    if (text.length === 0) {
      return
    }

    if (inlineSourceTag === undefined && text.trim().length > 0) {
      inlineSourceTag = sourceTag
    }

    inlineParts.push(text)
  }

  const flushInlineText = (): void => {
    const text = normalizeReadableText(inlineParts.join(''))
    if (text.length > 0) {
      state.blocks.push(
        createParagraphBlock(nextBlockId(state, 'paragraph', inlineSourceTag ?? '#text'), text),
      )
    }

    inlineParts.length = 0
    inlineSourceTag = undefined
  }

  parent.childNodes.forEach((child) => {
    if (child.nodeType === textNode) {
      appendInlineText(child.textContent ?? '', '#text')
      return
    }

    if (child.nodeType !== elementNode) {
      return
    }

    const element = child as Element
    const sourceTag = tagName(element)

    if (dangerousTags.has(sourceTag)) {
      return
    }

    if (isInlineCodeElement(element, inlineParts)) {
      appendInlineText(extractReadableText(element), sourceTag)
      return
    }

    if (isSupportedBlockElement(element)) {
      flushInlineText()
      appendSupportedBlock(element, state)
      return
    }

    if (isContainerElement(element)) {
      flushInlineText()
      appendBlocksFromChildren(element, state)
      return
    }

    appendInlineText(extractReadableText(element), sourceTag)
  })

  flushInlineText()
}

function appendSupportedBlock(element: Element, state: ImportState): void {
  const sourceTag = tagName(element)

  if (sourceTag === 'p') {
    state.blocks.push(
      createParagraphBlock(
        nextBlockId(state, 'paragraph', sourceTag),
        extractReadableText(element),
      ),
    )
    return
  }

  if (isHeadingTag(sourceTag)) {
    state.blocks.push(
      createHeadingBlock(
        nextBlockId(state, 'heading', sourceTag),
        headingLevelFromTag(sourceTag),
        extractReadableText(element),
      ),
    )
    return
  }

  if (sourceTag === 'blockquote') {
    state.blocks.push(
      createQuoteBlock(nextBlockId(state, 'quote', sourceTag), extractReadableText(element)),
    )
    return
  }

  if (sourceTag === 'pre' || sourceTag === 'code') {
    state.blocks.push(createCodeBlock(nextBlockId(state, 'code', sourceTag), element))
    return
  }

  state.blocks.push(createDividerBlock(nextBlockId(state, 'divider', sourceTag)))
}

function nextBlockId(
  state: ImportState,
  blockType: HtmlImportedBlock['type'],
  sourceTag: string,
): BlockId {
  return state.generateBlockId({
    blockType,
    ordinal: state.blocks.length + 1,
    sourceTag,
  })
}

function isSupportedBlockElement(element: Element): boolean {
  const sourceTag = tagName(element)
  return (
    sourceTag === 'p' ||
    sourceTag === 'blockquote' ||
    sourceTag === 'pre' ||
    sourceTag === 'code' ||
    sourceTag === 'hr' ||
    isHeadingTag(sourceTag)
  )
}

function isInlineCodeElement(element: Element, inlineParts: readonly string[]): boolean {
  return (
    tagName(element) === 'code' &&
    (hasReadableInlineParts(inlineParts) || hasReadableInlineSibling(element))
  )
}

function hasReadableInlineParts(inlineParts: readonly string[]): boolean {
  return inlineParts.some((part) => part.trim().length > 0)
}

function hasReadableInlineSibling(element: Element): boolean {
  let sibling = element.nextSibling

  while (sibling !== null) {
    if (sibling.nodeType === textNode && (sibling.textContent ?? '').trim().length > 0) {
      return true
    }

    if (sibling.nodeType === elementNode) {
      const siblingElement = sibling as Element
      const sourceTag = tagName(siblingElement)

      if (dangerousTags.has(sourceTag)) {
        sibling = sibling.nextSibling
        continue
      }

      if (sourceTag === 'br') {
        return true
      }

      if (!isSupportedBlockElement(siblingElement)) {
        if (extractReadableText(siblingElement).length > 0) {
          return true
        }

        sibling = sibling.nextSibling
        continue
      }

      if (isInlineCodeElement(siblingElement, [])) {
        return true
      }

      return false
    }

    sibling = sibling.nextSibling
  }

  return false
}

function isContainerElement(element: Element): boolean {
  const sourceTag = tagName(element)
  return containerTags.has(sourceTag) || element.querySelector(blockDescendantSelector) !== null
}

function tagName(element: Element): string {
  return element.tagName.toLowerCase()
}

function isHeadingTag(sourceTag: string): sourceTag is 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  return /^h[1-6]$/.test(sourceTag)
}

function headingLevelFromTag(
  sourceTag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
): HeadingBlock['props']['level'] {
  return Number.parseInt(sourceTag.slice(1), 10) as HeadingBlock['props']['level']
}

function extractReadableText(node: Node): string {
  return normalizeReadableText(collectReadableText(node))
}

function collectReadableText(node: Node): string {
  if (node.nodeType === textNode) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== elementNode) {
    return ''
  }

  const element = node as Element
  const sourceTag = tagName(element)

  if (dangerousTags.has(sourceTag)) {
    return ''
  }

  if (sourceTag === 'br') {
    return '\n'
  }

  const text = collectChildText(element, collectReadableText)

  if (readableTextBoundaryTags.has(sourceTag) && text.length > 0 && !text.endsWith('\n')) {
    return `${text}\n`
  }

  return text
}

function collectChildText(node: Node, collectText: (node: Node) => string): string {
  let text = ''
  node.childNodes.forEach((child) => {
    text += collectText(child)
  })

  return text
}

function normalizeReadableText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

function createCodeBlock(id: BlockId, element: Element): HtmlCodeBlock {
  const codeElement =
    tagName(element) === 'pre' ? (element.querySelector('code') ?? undefined) : element
  const language = findLanguage(codeElement) ?? findLanguage(element)

  return {
    id,
    type: 'code',
    ...(language === undefined ? {} : { props: { language } }),
    content: normalizeCodeText(collectCodeText(codeElement ?? element)),
  }
}

function findLanguage(element: Element | undefined): string | undefined {
  if (element === undefined) {
    return undefined
  }

  const className = element.getAttribute('class') ?? ''
  const classNames = className.split(/\s+/)

  for (const name of classNames) {
    if (name.startsWith('language-') && name.length > 'language-'.length) {
      const language = sanitizeCodeLanguage(name.slice('language-'.length))
      if (language !== undefined) {
        return language
      }
    }
  }

  return undefined
}

function sanitizeCodeLanguage(rawLanguage: string): string | undefined {
  const safeToken = rawLanguage.trim().replace(/[^A-Za-z0-9_+-]/g, '')

  return safeToken.length === 0 ? undefined : safeToken
}

function collectCodeText(node: Node): string {
  if (node.nodeType === textNode) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== elementNode) {
    return ''
  }

  const element = node as Element
  const sourceTag = tagName(element)

  if (dangerousTags.has(sourceTag)) {
    return ''
  }

  if (sourceTag === 'br') {
    return '\n'
  }

  return collectChildText(element, collectCodeText)
}

function normalizeCodeText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function assertValidImportedBlockIds(blocks: readonly HtmlImportedBlock[], rootId: BlockId): void {
  const seenBlockIds = new Set<BlockId>()

  for (const block of blocks) {
    if (block.id === rootId) {
      throw new Error(`HTML import produced block id "${block.id}" that conflicts with root.`)
    }

    if (seenBlockIds.has(block.id)) {
      throw new Error(`HTML import produced duplicate block id "${block.id}".`)
    }

    seenBlockIds.add(block.id)
  }
}
