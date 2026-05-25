import type { BlockId } from '@vetra/core'

const inlineEditorSelector = '.vetra-inline-editor[contenteditable="true"]'

export function getBlockShell(root: ParentNode | null, blockId: BlockId): HTMLElement | undefined {
  if (root === null) {
    return undefined
  }

  for (const element of root.querySelectorAll<HTMLElement>('[data-vetra-block-shell]')) {
    if (element.dataset.vetraBlockShell === blockId) {
      return element
    }
  }

  return undefined
}

export function focusBlockShell(root: ParentNode | null, blockId: BlockId): boolean {
  const blockShell = getBlockShell(root, blockId)
  if (blockShell === undefined) {
    return false
  }

  const inlineEditor = blockShell.querySelector<HTMLElement>(inlineEditorSelector)
  if (inlineEditor !== null) {
    inlineEditor.focus({ preventScroll: true })
    return true
  }

  blockShell.focus()
  return true
}

export function focusBlockShellAfterRender(anchor: Element | null, blockId: BlockId): void {
  const root = resolveEditorRoot(anchor)

  scheduleAfterRender(() => {
    focusBlockShell(root, blockId)
  })
}

function resolveEditorRoot(anchor: Element | null): ParentNode | null {
  if (anchor === null) {
    return null
  }

  const editorRoot = anchor.closest('.vetra-editor-root')
  return editorRoot ?? anchor
}

function scheduleAfterRender(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      callback()
    })
    return
  }

  globalThis.setTimeout(callback, 0)
}
