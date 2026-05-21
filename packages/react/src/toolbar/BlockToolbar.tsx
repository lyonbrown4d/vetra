import type { MouseEvent } from 'react'
import {
  useBlockToolbar,
  type BlockToolbarConvertResult,
  type UseBlockToolbarOptions,
} from '@vetra/react/toolbar/useBlockToolbar'
import type { BlockToolbarTarget } from '@vetra/react/toolbar/conversion'

export interface BlockToolbarProps extends UseBlockToolbarOptions {
  readonly className?: string
  readonly 'aria-label'?: string
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
