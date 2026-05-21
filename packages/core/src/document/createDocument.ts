import type { BlockId, DocBlock, DocumentState, RootBlock } from './types'

export interface CreateDocumentOptions {
  readonly id: string
  readonly rootId?: BlockId
  readonly blocks?: readonly DocBlock[]
  readonly meta?: DocumentState['meta']
}

export function createDocument(options: CreateDocumentOptions): DocumentState {
  const rootId = options.rootId ?? 'root'
  const rootBlock: RootBlock = {
    id: rootId,
    type: 'root',
  }

  const blocks: Record<BlockId, DocBlock> = {
    [rootId]: rootBlock,
  }

  const rootChildren: BlockId[] = []
  const children: Record<BlockId, BlockId[]> = {
    [rootId]: rootChildren,
  }

  for (const block of options.blocks ?? []) {
    blocks[block.id] = block
    children[block.id] = []
    rootChildren.push(block.id)
  }

  return {
    id: options.id,
    version: 1,
    rootId,
    blocks,
    children,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  }
}
