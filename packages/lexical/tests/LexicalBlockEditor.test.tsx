/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { createTextInlineContent, type InlineContent } from '@vetra/core'
import { LexicalBlockEditor } from '@vetra/lexical'

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

describe('LexicalBlockEditor', () => {
  it('syncs external value changes into the mounted Lexical editor without emitting onChange', async () => {
    const changes: InlineContent[] = []
    const rendered = renderLexicalBlockEditor({
      value: inlineText('Before'),
      onChange(nextValue) {
        changes.push(nextValue)
      },
    })

    try {
      await flushLexicalUpdates()
      expect(readEditableText(rendered.container)).toBe('Before')

      changes.length = 0
      rendered.rerender({
        value: inlineText('After'),
        onChange(nextValue) {
          changes.push(nextValue)
        },
      })
      await flushLexicalUpdates()

      expect(readEditableText(rendered.container)).toBe('After')
      expect(changes).toEqual([])
    } finally {
      rendered.cleanup()
    }
  })
})

interface RenderLexicalBlockEditorOptions {
  readonly value: InlineContent
  readonly onChange: (nextValue: InlineContent) => void
}

function renderLexicalBlockEditor(options: RenderLexicalBlockEditorOptions) {
  const container = document.createElement('div')
  document.body.append(container)

  const root = createRoot(container)

  renderIntoRoot(root, options)

  return {
    container,
    rerender(nextOptions: RenderLexicalBlockEditorOptions) {
      renderIntoRoot(root, nextOptions)
    },
    cleanup() {
      unmountRoot(root)
      container.remove()
    },
  }
}

function renderIntoRoot(root: Root, options: RenderLexicalBlockEditorOptions): void {
  act(() => {
    root.render(
      <LexicalBlockEditor
        className="vetra-inline-editor"
        onChange={options.onChange}
        value={options.value}
      />,
    )
  })
}

function unmountRoot(root: Root): void {
  act(() => {
    root.unmount()
  })
}

async function flushLexicalUpdates(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function readEditableText(container: HTMLElement): string {
  const editable = container.querySelector('[contenteditable="true"]')

  if (!(editable instanceof HTMLElement)) {
    throw new Error('Expected Lexical contenteditable to be rendered.')
  }

  return editable.textContent
}

function inlineText(text: string): InlineContent {
  return createTextInlineContent(text)
}
