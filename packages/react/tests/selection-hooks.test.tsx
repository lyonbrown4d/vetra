/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createEditor,
  createEditorState,
  createTextInlineContent,
  type DocBlock,
  type DocumentSelection,
  type EditorRuntime,
  type ParagraphBlock,
} from '@vetra/core'
import {
  EditorProvider,
  useActiveBlock,
  useBlock,
  useBlockSelection,
  useVisibleBlocks,
  type ActiveBlockState,
  type BlockSelectionState,
} from '@vetra/react'
import { useRootBlockList } from '@vetra/react/hooks/useRootBlockList'

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

interface HookSnapshot {
  readonly blockSelection: BlockSelectionState
  readonly activeBlock: ActiveBlockState
  readonly visibleBlocks: readonly DocBlock[]
}

interface RangeHookSnapshot {
  readonly blockA: BlockSelectionState
  readonly blockB: BlockSelectionState
  readonly blockC: BlockSelectionState
  readonly blockD: BlockSelectionState
}

function paragraph(id: string, text: string): ParagraphBlock {
  return {
    id,
    type: 'paragraph',
    content: createTextInlineContent(text),
  }
}

function renderProbe(editor: EditorRuntime, onSnapshot: (snapshot: HookSnapshot) => void) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  function Probe() {
    onSnapshot({
      blockSelection: useBlockSelection('block-a'),
      activeBlock: useActiveBlock(),
      visibleBlocks: useVisibleBlocks({ blockIds: ['block-b', 'missing', 'block-a'] }),
    })

    return null
  }

  act(() => {
    root.render(
      <EditorProvider blocks={[]} editor={editor}>
        <Probe />
      </EditorProvider>,
    )
  })

  return () => {
    unmountRoot(root)
    container.remove()
  }
}

function renderRangeProbe(
  editor: EditorRuntime,
  onSnapshot: (snapshot: RangeHookSnapshot) => void,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  function Probe() {
    onSnapshot({
      blockA: useBlockSelection('block-a'),
      blockB: useBlockSelection('block-b'),
      blockC: useBlockSelection('block-c'),
      blockD: useBlockSelection('block-d'),
    })

    return null
  }

  act(() => {
    root.render(
      <EditorProvider blocks={[]} editor={editor}>
        <Probe />
      </EditorProvider>,
    )
  })

  return () => {
    unmountRoot(root)
    container.remove()
  }
}

function unmountRoot(root: Root) {
  act(() => {
    root.unmount()
  })
}

describe('selection hooks', () => {
  it('projects block selection, active block, and visible blocks from editor state', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const editor = createEditor(createEditorState(document))
    let snapshot: HookSnapshot | undefined
    const cleanup = renderProbe(editor, (nextSnapshot) => {
      snapshot = nextSnapshot
    })

    try {
      expect(snapshot?.blockSelection).toMatchObject({
        active: false,
        selected: false,
        selection: { type: 'none' },
      })
      expect(snapshot?.activeBlock.blockId).toBeUndefined()
      expect(snapshot?.visibleBlocks.map((block) => block.id)).toEqual(['block-b', 'block-a'])

      act(() => {
        editor.dispatch({
          type: 'setSelection',
          selection: { type: 'block', blockId: 'block-a' },
        })
      })

      expect(snapshot?.blockSelection).toMatchObject({
        active: true,
        selected: true,
        selection: { type: 'block', blockId: 'block-a' },
      })
      expect(snapshot?.activeBlock.blockId).toBe('block-a')
      expect(snapshot?.activeBlock.block?.id).toBe('block-a')
    } finally {
      cleanup()
    }
  })

  it('projects contiguous range block membership in hook output', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [
        paragraph('block-a', 'A'),
        paragraph('block-b', 'B'),
        paragraph('block-c', 'C'),
        paragraph('block-d', 'D'),
      ],
    })
    const editor = createEditor(createEditorState(document))
    const rangeSelection = {
      type: 'range-block',
      anchorBlockId: 'block-a',
      focusBlockId: 'block-c',
    } satisfies DocumentSelection
    let snapshot: RangeHookSnapshot | undefined
    const cleanup = renderRangeProbe(editor, (nextSnapshot) => {
      snapshot = nextSnapshot
    })

    try {
      act(() => {
        editor.dispatch({
          type: 'setSelection',
          selection: rangeSelection,
        })
      })

      expect(snapshot?.blockA).toMatchObject({
        active: true,
        selected: true,
        selection: rangeSelection,
      })
      expect(snapshot?.blockB).toMatchObject({
        active: true,
        selected: true,
        selection: rangeSelection,
      })
      expect(snapshot?.blockC).toMatchObject({
        active: true,
        selected: true,
        selection: rangeSelection,
      })
      expect(snapshot?.blockD).toMatchObject({
        active: false,
        selected: false,
        selection: rangeSelection,
      })
    } finally {
      cleanup()
    }
  })

  it('normalizes invalid selection references in hook output', () => {
    const document = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A')],
    })
    const editor = createEditor({
      document,
      selection: { type: 'block', blockId: 'missing' },
    })
    let snapshot: HookSnapshot | undefined
    const cleanup = renderProbe(editor, (nextSnapshot) => {
      snapshot = nextSnapshot
    })

    try {
      expect(snapshot?.blockSelection).toMatchObject({
        active: false,
        selected: false,
        selection: { type: 'none' },
      })
      expect(snapshot?.activeBlock.blockId).toBeUndefined()
      expect(snapshot?.activeBlock.block).toBeUndefined()
    } finally {
      cleanup()
    }
  })
})

describe('block hook subscriptions', () => {
  it('does not re-render the root block list subscriber when block content changes', () => {
    const editorDocument = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const editor = createEditor(createEditorState(editorDocument))
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let renderCount = 0
    let rootBlockIds: readonly string[] = []

    function Probe() {
      const rootBlockList = useRootBlockList()
      renderCount += 1
      rootBlockIds = rootBlockList.blockIds

      return null
    }

    act(() => {
      root.render(
        <EditorProvider blocks={[]} editor={editor}>
          <Probe />
        </EditorProvider>,
      )
    })

    try {
      expect(renderCount).toBe(1)
      expect(rootBlockIds).toEqual(['block-a', 'block-b'])

      act(() => {
        editor.dispatch({
          type: 'updateBlock',
          blockId: 'block-a',
          patch: { content: createTextInlineContent('A changed') },
        })
      })

      expect(renderCount).toBe(1)
      expect(rootBlockIds).toEqual(['block-a', 'block-b'])

      act(() => {
        editor.dispatch({
          type: 'insertBlockAfter',
          referenceBlockId: 'block-a',
          block: paragraph('block-c', 'C'),
        })
      })

      expect(renderCount).toBe(2)
      expect(rootBlockIds).toEqual(['block-a', 'block-c', 'block-b'])
    } finally {
      unmountRoot(root)
      container.remove()
    }
  })
  it('does not re-render a block subscriber when another block changes', () => {
    const editorDocument = createDocument({
      id: 'doc',
      blocks: [paragraph('block-a', 'A'), paragraph('block-b', 'B')],
    })
    const editor = createEditor(createEditorState(editorDocument))
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let renderCount = 0
    let blockText = ''

    function Probe() {
      const block = useBlock('block-a')
      renderCount += 1
      blockText = readBlockText(block)

      return null
    }

    act(() => {
      root.render(
        <EditorProvider blocks={[]} editor={editor}>
          <Probe />
        </EditorProvider>,
      )
    })

    try {
      expect(renderCount).toBe(1)
      expect(blockText).toBe('A')

      act(() => {
        editor.dispatch({
          type: 'updateBlock',
          blockId: 'block-b',
          patch: { content: createTextInlineContent('B changed') },
        })
      })

      expect(renderCount).toBe(1)
      expect(blockText).toBe('A')

      act(() => {
        editor.dispatch({
          type: 'updateBlock',
          blockId: 'block-a',
          patch: { content: createTextInlineContent('A changed') },
        })
      })

      expect(renderCount).toBe(2)
      expect(blockText).toBe('A changed')
    } finally {
      unmountRoot(root)
      container.remove()
    }
  })
})

interface InlineTextNodeLike {
  readonly type: string
  readonly text?: string
}

interface InlineContentLike {
  readonly children: readonly InlineTextNodeLike[]
}

function readBlockText(block: DocBlock | undefined): string {
  const content = block?.content
  if (!isInlineContentLike(content)) {
    return ''
  }

  const firstNode = content.children[0]

  return firstNode?.type === 'text' ? (firstNode.text ?? '') : ''
}

function isInlineContentLike(value: unknown): value is InlineContentLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'children' in value &&
    Array.isArray(value.children)
  )
}
