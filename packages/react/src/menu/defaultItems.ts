import {
  createEmptyInlineContent,
  type BlockId,
  type ConvertBlockTypeCommand,
  type DividerBlock,
  type DocBlock,
  type HeadingBlock,
  type ParagraphBlock,
  type QuoteBlock,
} from '@vetra/core'
import type { SlashMenuItem } from '@vetra/react/menu/types'

export type BasicSlashMenuBlockType = 'paragraph' | 'heading' | 'quote' | 'code' | 'divider'

export interface SlashMenuCodeBlock extends DocBlock {
  readonly type: 'code'
  readonly content: string
}

export type BasicSlashMenuBlock =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | SlashMenuCodeBlock
  | DividerBlock

export const defaultSlashMenuItems: readonly SlashMenuItem[] = [
  createBasicSlashMenuItem({
    id: 'paragraph',
    label: 'Paragraph',
    blockType: 'paragraph',
    description: 'Plain text block',
    keywords: ['text', 'body'],
  }),
  createBasicSlashMenuItem({
    id: 'heading',
    label: 'Heading',
    blockType: 'heading',
    description: 'Section heading',
    keywords: ['title', 'h2'],
  }),
  createBasicSlashMenuItem({
    id: 'quote',
    label: 'Quote',
    blockType: 'quote',
    description: 'Quoted text',
    keywords: ['blockquote', 'citation'],
  }),
  createBasicSlashMenuItem({
    id: 'code',
    label: 'Code',
    blockType: 'code',
    description: 'Code block',
    keywords: ['pre', 'snippet'],
  }),
  createBasicSlashMenuItem({
    id: 'divider',
    label: 'Divider',
    blockType: 'divider',
    description: 'Horizontal rule',
    keywords: ['rule', 'separator', 'hr'],
  }),
]

export function createBasicSlashMenuItem(options: {
  readonly id: string
  readonly label: string
  readonly blockType: BasicSlashMenuBlockType
  readonly description?: string
  readonly keywords?: readonly string[]
}): SlashMenuItem {
  return {
    ...options,
    createBlock: ({ blockId }) => createBasicSlashMenuBlock(options.blockType, blockId),
    createConvertCommand: ({ targetBlockId }) =>
      createBasicSlashMenuConvertCommand(options.blockType, targetBlockId),
  }
}

export function createBasicSlashMenuBlock(
  blockType: BasicSlashMenuBlockType,
  blockId: BlockId,
): BasicSlashMenuBlock {
  switch (blockType) {
    case 'paragraph':
      return {
        id: blockId,
        type: 'paragraph',
        content: createEmptyInlineContent(),
      }
    case 'heading':
      return {
        id: blockId,
        type: 'heading',
        props: { level: 2 },
        content: createEmptyInlineContent(),
      }
    case 'quote':
      return {
        id: blockId,
        type: 'quote',
        content: createEmptyInlineContent(),
      }
    case 'code':
      return {
        id: blockId,
        type: 'code',
        content: '',
      }
    case 'divider':
      return {
        id: blockId,
        type: 'divider',
      }
  }
}

export function createBasicSlashMenuConvertCommand(
  blockType: BasicSlashMenuBlockType,
  blockId: BlockId,
): ConvertBlockTypeCommand {
  switch (blockType) {
    case 'paragraph':
      return {
        type: 'convertBlockType',
        blockId,
        blockType: 'paragraph',
        props: undefined,
        content: createEmptyInlineContent(),
      }
    case 'heading':
      return {
        type: 'convertBlockType',
        blockId,
        blockType: 'heading',
        props: { level: 2 },
        content: createEmptyInlineContent(),
      }
    case 'quote':
      return {
        type: 'convertBlockType',
        blockId,
        blockType: 'quote',
        props: undefined,
        content: createEmptyInlineContent(),
      }
    case 'code':
      return {
        type: 'convertBlockType',
        blockId,
        blockType: 'code',
        props: undefined,
        content: '',
      }
    case 'divider':
      return {
        type: 'convertBlockType',
        blockId,
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
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length === 0) {
    return items
  }

  return items.filter((item) => slashMenuItemMatchesQuery(item, normalizedQuery))
}

function slashMenuItemMatchesQuery(item: SlashMenuItem, normalizedQuery: string): boolean {
  if (item.label.toLowerCase().includes(normalizedQuery)) {
    return true
  }

  if (item.blockType.toLowerCase().includes(normalizedQuery)) {
    return true
  }

  return item.keywords?.some((keyword) => keyword.toLowerCase().includes(normalizedQuery)) ?? false
}
