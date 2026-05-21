import type { DocumentSelection, InlinePoint } from '@vetra/core'

export function areDocumentSelectionsEqual(
  previous: DocumentSelection,
  next: DocumentSelection,
): boolean {
  if (previous.type !== next.type) {
    return false
  }

  switch (previous.type) {
    case 'none':
      return true
    case 'block':
      return next.type === 'block' && previous.blockId === next.blockId
    case 'text':
      return (
        next.type === 'text' &&
        previous.blockId === next.blockId &&
        areInlinePointsEqual(previous.anchor, next.anchor) &&
        areInlinePointsEqual(previous.focus, next.focus)
      )
    case 'range-block':
      return (
        next.type === 'range-block' &&
        previous.anchorBlockId === next.anchorBlockId &&
        previous.focusBlockId === next.focusBlockId
      )
  }
}

function areInlinePointsEqual(previous: InlinePoint, next: InlinePoint): boolean {
  return (
    previous.offset === next.offset &&
    previous.path.length === next.path.length &&
    previous.path.every((pathPart, index) => pathPart === next.path[index])
  )
}
