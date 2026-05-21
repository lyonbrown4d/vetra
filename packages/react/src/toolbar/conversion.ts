import {
  createEmptyInlineContent,
  createTextInlineContent,
  type ConvertBlockTypeCommand,
  type DocBlock,
  type InlineContent,
  type InlineMark,
  type InlineNode,
} from '@vetra/core'

export type BlockToolbarHeadingLevel = 1 | 2 | 3

export type BlockToolbarTarget =
  | { readonly type: 'paragraph' }
  | { readonly type: 'heading'; readonly level: BlockToolbarHeadingLevel }
  | { readonly type: 'quote' }
  | { readonly type: 'code'; readonly language?: string }

export interface BlockToolbarItem {
  readonly id: string
  readonly label: string
  readonly target: BlockToolbarTarget
  readonly active: boolean
  readonly disabled: boolean
}

export interface CreateConvertBlockTypeCommandOptions {
  readonly updatedAt?: number
}

export const DEFAULT_BLOCK_TOOLBAR_TARGETS = [
  { type: 'paragraph' },
  { type: 'heading', level: 1 },
  { type: 'heading', level: 2 },
  { type: 'heading', level: 3 },
  { type: 'quote' },
  { type: 'code' },
] as const satisfies readonly BlockToolbarTarget[]

export function getBlockToolbarItems(
  block: DocBlock | undefined,
  targets: readonly BlockToolbarTarget[] = DEFAULT_BLOCK_TOOLBAR_TARGETS,
): readonly BlockToolbarItem[] {
  const activeTarget = resolveActiveBlockToolbarTarget(block)
  const disabled = block === undefined || !isConvertibleToolbarBlock(block)

  return targets.map((target) => ({
    id: getBlockToolbarTargetId(target),
    label: getBlockToolbarTargetLabel(target),
    target,
    active: activeTarget === undefined ? false : areBlockToolbarTargetsEqual(activeTarget, target),
    disabled,
  }))
}

export function resolveActiveBlockToolbarTarget(
  block: DocBlock | undefined,
): BlockToolbarTarget | undefined {
  if (block === undefined) {
    return undefined
  }

  switch (block.type) {
    case 'paragraph':
      return { type: 'paragraph' }
    case 'heading': {
      const level = readHeadingLevel(block)

      return level === undefined ? undefined : { type: 'heading', level }
    }
    case 'quote':
      return { type: 'quote' }
    case 'code': {
      const language = readCodeLanguage(block)

      return language === undefined ? { type: 'code' } : { type: 'code', language }
    }
    default:
      return undefined
  }
}

export function isConvertibleToolbarBlock(block: DocBlock): boolean {
  return (
    block.type === 'paragraph' ||
    block.type === 'heading' ||
    block.type === 'quote' ||
    block.type === 'code'
  )
}

export function createConvertBlockTypeCommand(
  block: DocBlock | undefined,
  target: BlockToolbarTarget,
  options: CreateConvertBlockTypeCommandOptions = {},
): ConvertBlockTypeCommand | undefined {
  if (
    block === undefined ||
    !isConvertibleToolbarBlock(block) ||
    isBlockAlreadyTarget(block, target)
  ) {
    return undefined
  }

  switch (target.type) {
    case 'paragraph':
      return withUpdatedAt(
        {
          type: 'convertBlockType',
          blockId: block.id,
          blockType: 'paragraph',
          props: undefined,
          content: coerceInlineContent(block.content),
        },
        options,
      )
    case 'heading':
      return withUpdatedAt(
        {
          type: 'convertBlockType',
          blockId: block.id,
          blockType: 'heading',
          props: { level: target.level },
          content: coerceInlineContent(block.content),
        },
        options,
      )
    case 'quote':
      return withUpdatedAt(
        {
          type: 'convertBlockType',
          blockId: block.id,
          blockType: 'quote',
          props: undefined,
          content: coerceInlineContent(block.content),
        },
        options,
      )
    case 'code':
      return withUpdatedAt(
        {
          type: 'convertBlockType',
          blockId: block.id,
          blockType: 'code',
          props: target.language === undefined ? undefined : { language: target.language },
          content: coercePlainTextContent(block.content),
        },
        options,
      )
  }
}

export function getBlockToolbarTargetId(target: BlockToolbarTarget): string {
  switch (target.type) {
    case 'paragraph':
      return 'paragraph'
    case 'heading':
      return `heading-${String(target.level)}`
    case 'quote':
      return 'quote'
    case 'code':
      return target.language === undefined ? 'code' : `code-${target.language}`
  }
}

export function getBlockToolbarTargetLabel(target: BlockToolbarTarget): string {
  switch (target.type) {
    case 'paragraph':
      return 'Paragraph'
    case 'heading':
      return `H${String(target.level)}`
    case 'quote':
      return 'Quote'
    case 'code':
      return 'Code'
  }
}

export function areBlockToolbarTargetsEqual(
  left: BlockToolbarTarget,
  right: BlockToolbarTarget,
): boolean {
  if (left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case 'paragraph':
    case 'quote':
      return true
    case 'heading':
      return right.type === 'heading' && left.level === right.level
    case 'code':
      return right.type === 'code' && left.language === right.language
  }
}

export function coerceInlineContent(content: unknown): InlineContent {
  if (isInlineContent(content)) {
    return content
  }

  const text = coercePlainTextContent(content)

  return text.length === 0 ? createEmptyInlineContent() : createTextInlineContent(text)
}

export function coercePlainTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!isInlineContent(content)) {
    return ''
  }

  return content.children.map((node) => inlineNodeToPlainText(node)).join('')
}

function withUpdatedAt(
  command: ConvertBlockTypeCommand,
  options: CreateConvertBlockTypeCommandOptions,
): ConvertBlockTypeCommand {
  return options.updatedAt === undefined ? command : { ...command, updatedAt: options.updatedAt }
}

function isBlockAlreadyTarget(block: DocBlock, target: BlockToolbarTarget): boolean {
  if (block.type !== target.type) {
    return false
  }

  switch (target.type) {
    case 'paragraph':
    case 'quote':
      return true
    case 'heading':
      return readHeadingLevel(block) === target.level
    case 'code':
      return target.language === undefined || readCodeLanguage(block) === target.language
  }
}

function readHeadingLevel(block: DocBlock): BlockToolbarHeadingLevel | undefined {
  const level = block.props?.level

  return level === 1 || level === 2 || level === 3 ? level : undefined
}

function readCodeLanguage(block: DocBlock): string | undefined {
  const language = block.props?.language

  return typeof language === 'string' && language.length > 0 ? language : undefined
}

function isInlineContent(value: unknown): value is InlineContent {
  if (!isRecord(value) || value.type !== 'inline-content' || typeof value.version !== 'number') {
    return false
  }

  const children = value.children

  return Array.isArray(children) && children.every(isInlineNode)
}

function isInlineNode(value: unknown): value is InlineNode {
  if (!isRecord(value)) {
    return false
  }

  switch (value.type) {
    case 'text':
      return typeof value.text === 'string' && isInlineMarkList(value.marks)
    case 'inline-code':
      return typeof value.text === 'string'
    case 'mention':
      return typeof value.id === 'string' && typeof value.label === 'string'
    case 'link': {
      const children = value.children

      return (
        typeof value.href === 'string' && Array.isArray(children) && children.every(isInlineNode)
      )
    }
    default:
      return false
  }
}

function isInlineMarkList(value: unknown): value is readonly InlineMark[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isInlineMark))
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

function inlineNodeToPlainText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
    case 'inline-code':
      return node.text
    case 'mention':
      return node.label
    case 'link':
      return node.children.map((child) => inlineNodeToPlainText(child)).join('')
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
