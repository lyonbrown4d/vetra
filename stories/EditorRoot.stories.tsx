import type { Meta, StoryObj } from '@storybook/react'
import React, { useMemo } from 'react'
import { basicBlocks } from '@vetra/blocks-basic/react'
import {
  createCodeBlock,
  createDividerBlock,
  createHeadingBlock,
  createParagraphBlock,
  createQuoteBlock,
} from '@vetra/blocks-basic'
import {
  createDocument,
  createEditor,
  createEditorState,
  type DocBlock,
  type DocumentSelection,
  type DocumentState,
} from '@vetra/core'
import { BlockToolbar, EditorProvider, EditorRoot, VirtualBlockList } from '@vetra/react'

const meta: Meta<typeof EditorRoot> = {
  title: 'Vetra/EditorRoot',
  component: EditorRoot,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story, context) => (
      <main className="vetra-storybook-shell">
        <header className="vetra-storybook-header">
          <div>
            <p className="vetra-storybook-eyebrow">Vetra component acceptance</p>
            <h1>{context.name}</h1>
          </div>
          <nav aria-label="Storybook sections" className="vetra-storybook-tabs">
            <span data-active="true">Editor</span>
            <span>Blocks</span>
            <span>Runtime</span>
          </nav>
        </header>
        <section className="vetra-storybook-stage">
          <Story />
        </section>
      </main>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof meta>

const editorClassName = 'vetra-editor-root vetra-story-editor'

const defaultDocument = createDocument({
  id: 'storybook-default',
  blocks: [
    createHeadingBlock('story-title', 1, 'Vetra Storybook'),
    createParagraphBlock(
      'story-body',
      'Readonly blocks switch to a single active Lexical editor when selected.',
    ),
    createQuoteBlock(
      'story-quote',
      'Virtualized block rendering keeps large documents responsive.',
    ),
    createCodeBlock(
      'story-code',
      "editor.dispatch({ type: 'insertBlockAfter', referenceBlockId: activeId, block })",
      'ts',
    ),
    createDividerBlock('story-divider'),
    createParagraphBlock('story-footer', 'Use / to open the block insert menu.'),
  ],
})

const emptyDocument = createDocument({
  id: 'storybook-empty',
  blocks: [createParagraphBlock('empty-paragraph')],
})

const selectedDocument = createDocument({
  id: 'storybook-selected',
  blocks: [
    createHeadingBlock('selected-title', 2, 'Selection state'),
    createParagraphBlock('selected-target', 'This block starts selected in the story harness.'),
    createParagraphBlock(
      'selected-neighbor',
      'Arrow navigation should move selection between shells.',
    ),
  ],
})

const selectedBlockSelection: DocumentSelection = {
  type: 'block',
  blockId: 'selected-target',
}

const rangeSelectedDocument = createDocument({
  id: 'storybook-range-selected',
  blocks: [
    createHeadingBlock('range-title', 2, 'Range selection state'),
    createParagraphBlock('range-anchor', 'The range starts on this block.'),
    createParagraphBlock('range-middle', 'This middle block should render as range selected.'),
    createQuoteBlock('range-focus', 'The range ends on this block.'),
    createParagraphBlock('range-after', 'This block should stay outside the selected range.'),
  ],
})

const rangeBlockSelection: DocumentSelection = {
  type: 'range-block',
  anchorBlockId: 'range-anchor',
  focusBlockId: 'range-focus',
}

const longContentDocument = createDocument({
  id: 'storybook-long-content',
  blocks: [
    createHeadingBlock('long-title', 2, 'Long content'),
    createParagraphBlock('long-body', createLongParagraph()),
    createQuoteBlock('long-quote', createLongParagraph()),
    createCodeBlock(
      'long-code',
      [
        'type RuntimeBoundary = {',
        "  readonly core: 'framework-agnostic'",
        "  readonly renderer: 'react'",
        "  readonly inlineEditor: 'lexical-active-block-only'",
        '}',
      ].join('\n'),
      'ts',
    ),
  ],
})

const unknownBlockDocument = createDocument({
  id: 'storybook-unknown-block',
  blocks: [
    createHeadingBlock('unknown-title', 2, 'Unknown block fallback'),
    {
      id: 'unknown-chart',
      type: 'analytics-chart',
      props: {
        provider: 'downstream-app',
      },
      content: {
        message: 'This custom block has no registered renderer in basicBlocks.',
      },
    } satisfies DocBlock,
    createParagraphBlock('unknown-after', 'The rest of the document remains renderable.'),
  ],
})

const virtualizedDocument = createDocument({
  id: 'storybook-virtualized',
  blocks: [
    createHeadingBlock('virtualized-title', 2, 'Benchmark-ish virtualized document'),
    ...Array.from({ length: 1200 }, (_, index) =>
      createParagraphBlock(
        `virtual-block-${String(index + 1)}`,
        `Virtual block ${String(index + 1)} keeps a stable id and is mounted only when visible.`,
      ),
    ),
  ],
})

const selectAllLargeVirtualizedSelection: DocumentSelection = {
  type: 'range-block',
  anchorBlockId: 'virtualized-title',
  focusBlockId: 'virtual-block-1200',
}

export const Default: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: defaultDocument,
  },
}

export const Empty: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: emptyDocument,
  },
}

export const Selected: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: selectedDocument,
  },
  render: () => (
    <StoryEditorHarness
      className={editorClassName}
      initialSelection={selectedBlockSelection}
      initialValue={selectedDocument}
    />
  ),
}

export const RangeSelected: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: rangeSelectedDocument,
  },
  render: () => (
    <StoryEditorHarness
      className={editorClassName}
      initialSelection={rangeBlockSelection}
      initialValue={rangeSelectedDocument}
    />
  ),
}

export const LongContent: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: longContentDocument,
  },
}

export const UnknownBlockFallback: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: unknownBlockDocument,
  },
}

export const BenchmarkishVirtualized: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: virtualizedDocument,
  },
  name: 'Benchmark-ish / Virtualized',
}

export const SelectAllLargeVirtualized: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: virtualizedDocument,
  },
  name: 'Select all / Large virtualized',
  render: () => (
    <StoryEditorHarness
      className={editorClassName}
      initialSelection={selectAllLargeVirtualizedSelection}
      initialValue={virtualizedDocument}
    />
  ),
}

interface StoryEditorHarnessProps {
  readonly className: string
  readonly initialSelection?: DocumentSelection
  readonly initialValue: DocumentState
}

function StoryEditorHarness(props: StoryEditorHarnessProps) {
  const editor = useMemo(() => {
    const runtime = createEditor(createEditorState(props.initialValue))

    if (props.initialSelection !== undefined) {
      const result = runtime.dispatch({
        type: 'setSelection',
        selection: props.initialSelection,
      })

      if (!result.ok) {
        throw new Error(result.error.message)
      }
    }

    return runtime
  }, [props.initialSelection, props.initialValue])

  return (
    <EditorProvider blocks={basicBlocks} editor={editor}>
      <div className={props.className}>
        <BlockToolbar className="vetra-block-toolbar" />
        <VirtualBlockList />
      </div>
    </EditorProvider>
  )
}

function createLongParagraph(): string {
  return [
    'Vetra keeps document state in framework-agnostic core primitives while React renders only the visible block shells.',
    'The active inline editor is mounted for the selected block, so typing does not require every block to become a rich text editor.',
    'This story intentionally uses a longer paragraph to validate wrapping, spacing, scroll measurement, and editor surface density.',
  ].join(' ')
}
