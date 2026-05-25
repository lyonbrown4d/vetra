import {
  createEmptyInlineContent,
  type BlockId,
  type ConvertBlockTypeCommand,
  type DividerBlock,
  type DocBlock,
  type HeadingBlock,
  type InlineContent,
  type ParagraphBlock,
  type QuoteBlock,
} from '@vetra/core'
import type { SlashMenuItem } from '@vetra/react/menu/types'

export type BasicSlashMenuBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'todo'
  | 'callout'
  | 'code'
  | 'divider'

export interface SlashMenuCodeBlock extends DocBlock {
  readonly type: 'code'
  readonly content: string
}

export interface SlashMenuTodoBlock extends DocBlock {
  readonly type: 'todo'
  readonly props: {
    readonly checked: boolean
  }
  readonly content: InlineContent
}

export interface SlashMenuCalloutBlock extends DocBlock {
  readonly type: 'callout'
  readonly props: {
    readonly tone: 'info'
  }
  readonly content: InlineContent
}

export type BasicSlashMenuBlock =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | SlashMenuTodoBlock
  | SlashMenuCalloutBlock
  | SlashMenuCodeBlock
  | DividerBlock

type SlashMenuHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export const defaultSlashMenuItems: readonly SlashMenuItem[] = [
  createBasicSlashMenuItem({
    id: 'paragraph',
    label: 'Paragraph',
    blockType: 'paragraph',
    icon: 'text',
    aliases: ['p', 'plain'],
    description: 'Plain text block',
    keywords: ['text', 'body'],
  }),
  createBasicSlashMenuItem({
    id: 'heading',
    label: 'Heading 2',
    blockType: 'heading',
    headingLevel: 2,
    icon: 'heading-2',
    aliases: ['h2', '##'],
    description: 'Section heading',
    keywords: ['title', 'subheading'],
  }),
  createBasicSlashMenuItem({
    id: 'heading-1',
    label: 'Heading 1',
    blockType: 'heading',
    headingLevel: 1,
    icon: 'heading-1',
    aliases: ['h1', '#'],
    description: 'Large section heading',
    keywords: ['title', 'heading'],
  }),
  createBasicSlashMenuItem({
    id: 'quote',
    label: 'Quote',
    blockType: 'quote',
    icon: 'quote',
    aliases: ['blockquote', '>'],
    description: 'Quoted text',
    keywords: ['blockquote', 'citation'],
  }),
  createBasicSlashMenuItem({
    id: 'todo',
    label: 'To-do',
    blockType: 'todo',
    icon: 'check-square',
    aliases: ['todo', 'task', 'checkbox', 'checklist'],
    description: 'Task block',
    keywords: ['check', 'done'],
  }),
  createBasicSlashMenuItem({
    id: 'callout',
    label: 'Callout',
    blockType: 'callout',
    icon: 'message-square-text',
    aliases: ['note', 'info', 'tip'],
    description: 'Highlighted note',
    keywords: ['aside', 'notice', 'warning'],
  }),
  createBasicSlashMenuItem({
    id: 'code',
    label: 'Code',
    blockType: 'code',
    icon: 'code',
    aliases: ['code', '```'],
    description: 'Code block',
    keywords: ['pre', 'snippet', 'js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'json'],
  }),
  createBasicSlashMenuItem({
    id: 'divider',
    label: 'Divider',
    blockType: 'divider',
    icon: 'separator-horizontal',
    aliases: ['hr', '---'],
    description: 'Horizontal rule',
    keywords: ['rule', 'separator', 'hr'],
  }),
]

export function createBasicSlashMenuItem(options: {
  readonly id: string
  readonly label: string
  readonly blockType: BasicSlashMenuBlockType
  readonly headingLevel?: SlashMenuHeadingLevel
  readonly icon?: string
  readonly aliases?: readonly string[]
  readonly description?: string
  readonly keywords?: readonly string[]
}): SlashMenuItem {
  const { headingLevel, ...itemOptions } = options

  return {
    ...itemOptions,
    createBlock: ({ blockId }) =>
      createBasicSlashMenuBlockFromOptions({
        blockId,
        blockType: options.blockType,
        headingLevel,
      }),
    createConvertCommand: ({ targetBlockId }) =>
      createBasicSlashMenuConvertCommandFromOptions({
        blockId: targetBlockId,
        blockType: options.blockType,
        headingLevel,
      }),
  }
}

export function createBasicSlashMenuBlock(
  blockType: BasicSlashMenuBlockType,
  blockId: BlockId,
): BasicSlashMenuBlock {
  return createBasicSlashMenuBlockFromOptions({ blockType, blockId })
}

function createBasicSlashMenuBlockFromOptions(options: {
  readonly blockType: BasicSlashMenuBlockType
  readonly blockId: BlockId
  readonly headingLevel?: SlashMenuHeadingLevel | undefined
}): BasicSlashMenuBlock {
  switch (options.blockType) {
    case 'paragraph':
      return {
        id: options.blockId,
        type: 'paragraph',
        content: createEmptyInlineContent(),
      }
    case 'heading':
      return {
        id: options.blockId,
        type: 'heading',
        props: { level: options.headingLevel ?? 2 },
        content: createEmptyInlineContent(),
      }
    case 'quote':
      return {
        id: options.blockId,
        type: 'quote',
        content: createEmptyInlineContent(),
      }
    case 'todo':
      return {
        id: options.blockId,
        type: 'todo',
        props: { checked: false },
        content: createEmptyInlineContent(),
      }
    case 'callout':
      return {
        id: options.blockId,
        type: 'callout',
        props: { tone: 'info' },
        content: createEmptyInlineContent(),
      }
    case 'code':
      return {
        id: options.blockId,
        type: 'code',
        content: '',
      }
    case 'divider':
      return {
        id: options.blockId,
        type: 'divider',
      }
  }
}

export function createBasicSlashMenuConvertCommand(
  blockType: BasicSlashMenuBlockType,
  blockId: BlockId,
): ConvertBlockTypeCommand {
  return createBasicSlashMenuConvertCommandFromOptions({ blockType, blockId })
}

function createBasicSlashMenuConvertCommandFromOptions(options: {
  readonly blockType: BasicSlashMenuBlockType
  readonly blockId: BlockId
  readonly headingLevel?: SlashMenuHeadingLevel | undefined
}): ConvertBlockTypeCommand {
  switch (options.blockType) {
    case 'paragraph':
      return {
        type: 'convertBlockType',
        blockId: options.blockId,
        blockType: 'paragraph',
        props: undefined,
        content: createEmptyInlineContent(),
      }
    case 'heading':
      return {
        type: 'convertBlockType',
        blockId: options.blockId,
        blockType: 'heading',
        props: { level: options.headingLevel ?? 2 },
        content: createEmptyInlineContent(),
      }
    case 'quote':
      return {
        type: 'convertBlockType',
        blockId: options.blockId,
        blockType: 'quote',
        props: undefined,
        content: createEmptyInlineContent(),
      }
    case 'todo':
      return {
        type: 'convertBlockType',
        blockId: options.blockId,
        blockType: 'todo',
        props: { checked: false },
        content: createEmptyInlineContent(),
      }
    case 'callout':
      return {
        type: 'convertBlockType',
        blockId: options.blockId,
        blockType: 'callout',
        props: { tone: 'info' },
        content: createEmptyInlineContent(),
      }
    case 'code':
      return {
        type: 'convertBlockType',
        blockId: options.blockId,
        blockType: 'code',
        props: undefined,
        content: '',
      }
    case 'divider':
      return {
        type: 'convertBlockType',
        blockId: options.blockId,
        blockType: 'divider',
        props: undefined,
        content: undefined,
      }
  }
}

export function filterSlashMenuItems(
  items: readonly SlashMenuItem[],
  query: string,
): readonly SlashMenuItem[] {
  const queryTokens = normalizeSlashMenuQuery(query)
  if (queryTokens.length === 0) {
    return items
  }

  return items.filter((item) => slashMenuItemMatchesQuery(item, queryTokens))
}

function normalizeSlashMenuQuery(query: string): readonly string[] {
  return query
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .split(/\s+/u)
    .filter((token) => token.length > 0)
}

function slashMenuItemMatchesQuery(
  item: SlashMenuItem,
  normalizedQueryTokens: readonly string[],
): boolean {
  const searchableText = createSlashMenuSearchableText(item)

  return normalizedQueryTokens.every((queryToken) =>
    searchableText.some((candidate) => candidate.includes(queryToken)),
  )
}

function createSlashMenuSearchableText(item: SlashMenuItem): readonly string[] {
  return [
    item.id,
    item.label,
    item.blockType,
    item.icon,
    item.description,
    ...(item.aliases ?? []),
    ...(item.keywords ?? []),
  ]
    .filter((candidate): candidate is string => candidate !== undefined)
    .map((candidate) => candidate.toLowerCase())
}
