import type { DocBlock } from '../document/types'

export interface BlockSchema<TBlock extends DocBlock = DocBlock> {
  readonly type: TBlock['type']
  readonly normalize?: (block: TBlock) => TBlock
  readonly validate?: (block: DocBlock) => block is TBlock
}

export interface BlockPlugin<TBlock extends DocBlock = DocBlock> {
  readonly type: TBlock['type']
  readonly schema: BlockSchema<TBlock>
}
