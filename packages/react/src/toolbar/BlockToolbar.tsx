import type { MouseEvent } from 'react'
import {
  useBlockToolbar,
  type BlockToolbarActionId,
  type BlockToolbarActionResult,
  type BlockToolbarConvertResult,
  type UseBlockToolbarOptions,
} from '@vetra/react/toolbar/useBlockToolbar'
import type { BlockToolbarTarget } from '@vetra/react/toolbar/conversion'

export interface BlockToolbarProps extends UseBlockToolbarOptions {
  readonly className?: string
  readonly 'aria-label'?: string
  readonly onAction?: (
    actionId: BlockToolbarActionId,
    result: BlockToolbarActionResult,
    event: MouseEvent<HTMLButtonElement>,
  ) => void
  readonly onConvert?: (
    target: BlockToolbarTarget,
    result: BlockToolbarConvertResult,
    event: MouseEvent<HTMLButtonElement>,
  ) => void
}

export function BlockToolbar(props: BlockToolbarProps) {
  const toolbar = useBlockToolbar(props)

  return (
    <div
      aria-label={props['aria-label'] ?? 'Block toolbar'}
      className={props.className}
      data-vetra-block-toolbar=""
      role="toolbar"
    >
      {toolbar.actionItems.map((item) => (
        <button
          aria-label={item.label}
          data-vetra-toolbar-action={item.id}
          disabled={item.disabled}
          key={item.id}
          onClick={(event) => {
            const result = toolbar.runAction(item.id)
            props.onAction?.(item.id, result, event)
          }}
          type="button"
        >
          {item.label}
        </button>
      ))}
      {toolbar.items.map((item) => (
        <button
          aria-pressed={item.active}
          data-vetra-toolbar-item={item.id}
          disabled={item.disabled}
          key={item.id}
          onClick={(event) => {
            const result = toolbar.convertBlock(item.target)
            props.onConvert?.(item.target, result, event)
          }}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
