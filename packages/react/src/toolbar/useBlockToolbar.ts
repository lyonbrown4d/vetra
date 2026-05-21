import { useCallback, useMemo } from 'react'
import type { BlockId, CommandError, DocBlock, Result, Transaction } from '@vetra/core'
import { useEditor } from '@vetra/react/context/EditorContext'
import { useActiveBlock } from '@vetra/react/hooks/useActiveBlock'
import {
  createConvertBlockTypeCommand,
  DEFAULT_BLOCK_TOOLBAR_TARGETS,
  getBlockToolbarItems,
  isConvertibleToolbarBlock,
  resolveActiveBlockToolbarTarget,
  type BlockToolbarItem,
  type BlockToolbarTarget,
} from '@vetra/react/toolbar/conversion'

export type BlockToolbarConvertResult = Result<Transaction, CommandError> | undefined

export interface UseBlockToolbarOptions {
  readonly targets?: readonly BlockToolbarTarget[]
  readonly getUpdatedAt?: () => number
}

export interface BlockToolbarState {
  readonly activeBlockId: BlockId | undefined
  readonly activeBlock: DocBlock | undefined
  readonly activeTarget: BlockToolbarTarget | undefined
  readonly canConvert: boolean
  readonly items: readonly BlockToolbarItem[]
  readonly convertBlock: (target: BlockToolbarTarget) => BlockToolbarConvertResult
}

export function useBlockToolbar(options: UseBlockToolbarOptions = {}): BlockToolbarState {
  const editor = useEditor()
  const activeBlockState = useActiveBlock()
  const targets = options.targets ?? DEFAULT_BLOCK_TOOLBAR_TARGETS
  const getUpdatedAt = options.getUpdatedAt

  const activeTarget = useMemo(
    () => resolveActiveBlockToolbarTarget(activeBlockState.block),
    [activeBlockState.block],
  )
  const canConvert =
    activeBlockState.block === undefined ? false : isConvertibleToolbarBlock(activeBlockState.block)
  const items = useMemo(
    () => getBlockToolbarItems(activeBlockState.block, targets),
    [activeBlockState.block, targets],
  )

  const convertBlock = useCallback(
    (target: BlockToolbarTarget): BlockToolbarConvertResult => {
      const updatedAt = getUpdatedAt?.()
      const command = createConvertBlockTypeCommand(
        activeBlockState.block,
        target,
        updatedAt === undefined ? {} : { updatedAt },
      )

      return command === undefined ? undefined : editor.dispatch(command)
    },
    [activeBlockState.block, editor, getUpdatedAt],
  )

  return {
    activeBlockId: activeBlockState.blockId,
    activeBlock: activeBlockState.block,
    activeTarget,
    canConvert,
    items,
    convertBlock,
  }
}
