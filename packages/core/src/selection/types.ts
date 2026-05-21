import type { BlockId } from '@vetra/core/document/types'

export type DocumentSelection = NoneSelection | BlockSelection | TextSelection | RangeBlockSelection

export interface NoneSelection {
  readonly type: 'none'
}

export interface BlockSelection {
  readonly type: 'block'
  readonly blockId: BlockId
}

export interface TextSelection {
  readonly type: 'text'
  readonly blockId: BlockId
  readonly anchor: InlinePoint
  readonly focus: InlinePoint
}

export interface RangeBlockSelection {
  readonly type: 'range-block'
  readonly anchorBlockId: BlockId
  readonly focusBlockId: BlockId
}

export interface InlinePoint {
  readonly path: readonly number[]
  readonly offset: number
}

export const noneSelection: NoneSelection = { type: 'none' }
