import type {
  BlockId,
  CommandError,
  ConvertBlockTypeCommand,
  DocBlock,
  EditorRuntime,
  InsertBlockAfterCommand,
  Result,
  Transaction,
} from '@vetra/core'

export type SlashMenuMode = 'insert-after' | 'convert'

export type SlashMenuBlockIdFactory = () => BlockId

export interface SlashMenuBlockFactoryContext {
  readonly blockId: BlockId
}

export interface SlashMenuConvertFactoryContext {
  readonly targetBlockId: BlockId
}

export interface SlashMenuItem {
  readonly id: string
  readonly label: string
  readonly blockType: string
  readonly icon?: string
  readonly aliases?: readonly string[]
  readonly description?: string
  readonly keywords?: readonly string[]
  readonly createBlock: (context: SlashMenuBlockFactoryContext) => DocBlock
  readonly createConvertCommand: (
    context: SlashMenuConvertFactoryContext,
  ) => ConvertBlockTypeCommand
}

export type SlashMenuIntent = InsertBlockSlashMenuIntent | ConvertBlockSlashMenuIntent

export interface InsertBlockSlashMenuIntent {
  readonly type: 'insertBlock'
  readonly item: SlashMenuItem
  readonly command: InsertBlockAfterCommand
  readonly insertedBlockId: BlockId
  readonly selectBlockId: BlockId
}

export interface ConvertBlockSlashMenuIntent {
  readonly type: 'convertBlock'
  readonly item: SlashMenuItem
  readonly command: ConvertBlockTypeCommand
  readonly selectBlockId: BlockId
}

export interface CreateSlashMenuIntentOptions {
  readonly item: SlashMenuItem
  readonly mode: SlashMenuMode
  readonly targetBlockId: BlockId
  readonly idFactory: SlashMenuBlockIdFactory
}

export interface SlashMenuSelectEvent {
  readonly item: SlashMenuItem
  readonly intent: SlashMenuIntent
  readonly result: Result<Transaction, CommandError>
}

export type SlashMenuSelectHandler = (event: SlashMenuSelectEvent) => void

export function createSlashMenuIntent(options: CreateSlashMenuIntentOptions): SlashMenuIntent {
  if (options.mode === 'convert') {
    return {
      type: 'convertBlock',
      item: options.item,
      command: options.item.createConvertCommand({
        targetBlockId: options.targetBlockId,
      }),
      selectBlockId: options.targetBlockId,
    }
  }

  const insertedBlockId = options.idFactory()
  const block = options.item.createBlock({ blockId: insertedBlockId })

  return {
    type: 'insertBlock',
    item: options.item,
    command: {
      type: 'insertBlockAfter',
      referenceBlockId: options.targetBlockId,
      block,
    },
    insertedBlockId,
    selectBlockId: insertedBlockId,
  }
}

export function dispatchSlashMenuIntent(
  editor: EditorRuntime,
  intent: SlashMenuIntent,
): Result<Transaction, CommandError> {
  const result = editor.dispatch(intent.command)
  if (!result.ok) {
    return result
  }

  editor.dispatch({
    type: 'setSelection',
    selection: { type: 'block', blockId: intent.selectBlockId },
  })

  return result
}
