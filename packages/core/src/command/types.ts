import type { BlockId, DocBlock } from '@vetra/core/document/types'
import type { DocumentSelection } from '@vetra/core/selection/types'

export type EditorCommand =
  | InsertBlockCommand
  | InsertBlockBeforeCommand
  | InsertBlockAfterCommand
  | InsertBlockFragmentCommand
  | DeleteBlockCommand
  | DeleteBlocksCommand
  | UpdateBlockCommand
  | MoveBlockCommand
  | MoveBlocksCommand
  | DuplicateBlockCommand
  | DuplicateBlocksCommand
  | ConvertBlockTypeCommand
  | SplitBlockCommand
  | MergeBlockCommand
  | SetSelectionCommand

export interface InsertBlockCommand {
  readonly type: 'insertBlock'
  readonly parentId: BlockId
  readonly block: DocBlock
  readonly index?: number
  readonly afterBlockId?: BlockId
  readonly beforeBlockId?: BlockId
}

export interface InsertBlockBeforeCommand {
  readonly type: 'insertBlockBefore'
  readonly referenceBlockId: BlockId
  readonly block: DocBlock
}

export interface InsertBlockAfterCommand {
  readonly type: 'insertBlockAfter'
  readonly referenceBlockId: BlockId
  readonly block: DocBlock
}

export interface InsertBlockFragmentCommand {
  readonly type: 'insertBlockFragment'
  readonly parentId: BlockId
  readonly index: number
  readonly rootBlockIds: readonly BlockId[]
  readonly blocks: Readonly<Record<BlockId, DocBlock>>
  readonly children: Readonly<Record<BlockId, readonly BlockId[]>>
  readonly replaceBlockIds?: readonly BlockId[]
  readonly selection?: DocumentSelection
}

export interface DeleteBlockCommand {
  readonly type: 'deleteBlock'
  readonly blockId: BlockId
}

export interface DeleteBlocksCommand {
  readonly type: 'deleteBlocks'
  readonly blockIds: readonly BlockId[]
}

export interface UpdateBlockCommand {
  readonly type: 'updateBlock'
  readonly blockId: BlockId
  readonly patch: BlockPatch
}

export interface BlockPatch {
  readonly type?: string
  readonly props?: Readonly<Record<string, unknown>>
  readonly content?: unknown
  readonly updatedAt?: number
}

export interface MoveBlockCommand {
  readonly type: 'moveBlock'
  readonly blockId: BlockId
  readonly toParentId: BlockId
  readonly toIndex: number
}

export interface MoveBlocksCommand {
  readonly type: 'moveBlocks'
  readonly blockIds: readonly BlockId[]
  readonly toParentId: BlockId
  readonly toIndex: number
  readonly selection?: DocumentSelection
}

export type DuplicateBlockPlacement = 'before' | 'after'

export interface DuplicateBlockCommand {
  readonly type: 'duplicateBlock'
  readonly blockId: BlockId
  readonly placement?: DuplicateBlockPlacement
  readonly idMap?: Readonly<Record<BlockId, BlockId>>
  readonly block?: DocBlock
}

export interface DuplicateBlocksCommand {
  readonly type: 'duplicateBlocks'
  readonly blockIds: readonly BlockId[]
  readonly placement?: DuplicateBlockPlacement
  readonly idMap: Readonly<Record<BlockId, BlockId>>
  readonly selection?: DocumentSelection
}

export interface ConvertBlockTypeCommand {
  readonly type: 'convertBlockType'
  readonly blockId: BlockId
  readonly blockType: string
  readonly props?: Readonly<Record<string, unknown>> | undefined
  readonly content?: unknown
  readonly updatedAt?: number | undefined
}

export interface SplitBlockCommand {
  readonly type: 'splitBlock'
  readonly blockId: BlockId
  readonly beforeContent?: unknown
  readonly afterBlock: DocBlock
}

export interface MergeBlockCommand {
  readonly type: 'mergeBlock'
  readonly targetBlockId: BlockId
  readonly sourceBlockId: BlockId
  readonly mergedContent?: unknown
}

export interface SetSelectionCommand {
  readonly type: 'setSelection'
  readonly selection: DocumentSelection
}
