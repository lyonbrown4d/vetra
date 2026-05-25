import type { Meta, StoryObj } from '@storybook/react'
import React, { useCallback, useMemo, useState } from 'react'
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

const acceptanceLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)',
  gap: 16,
  height: 'min(760px, calc(100vh - 130px))',
  minHeight: 520,
}

const acceptanceEditorFrameStyle: React.CSSProperties = {
  minHeight: 0,
  overflow: 'hidden',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#ffffff',
}

const acceptancePanelStyle: React.CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 12,
  minHeight: 0,
  overflow: 'auto',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#ffffff',
  padding: 12,
}

const acceptanceStatsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  margin: 0,
}

const acceptanceStatItemStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#f9fafb',
  padding: 8,
}

const acceptanceLabelStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: 11,
}

const acceptanceValueStyle: React.CSSProperties = {
  margin: '2px 0 0',
  color: '#111827',
  fontSize: 15,
  fontWeight: 700,
  overflowWrap: 'anywhere',
}

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

const notionLikeInteractionsDocument = createDocument({
  id: 'storybook-notion-like-interactions',
  blocks: [
    createHeadingBlock('notion-like-title', 2, 'Notion-like interaction baseline'),
    createParagraphBlock('notion-like-body', 'Open / here, use the gutter plus, or drag blocks.'),
    createQuoteBlock(
      'notion-like-quote',
      'The slash menu is fixed-positioned near the active block.',
    ),
    createParagraphBlock(
      'notion-like-tail',
      'Tail drop indicators only apply to the document tail.',
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

export const NotionLikeInteractions: Story = {
  args: {
    blocks: basicBlocks,
    className: editorClassName,
    initialValue: notionLikeInteractionsDocument,
  },
  name: 'Notion-like interactions',
  parameters: {
    docs: {
      description: {
        story:
          'Playground-like acceptance story for slash menu keyboard flow, gutter plus insertion, root-level drag handles, and document version observation.',
      },
    },
  },
  render: () => <StoryPlaygroundAcceptanceHarness initialValue={notionLikeInteractionsDocument} />,
}

interface StoryEditorHarnessProps {
  readonly className: string
  readonly initialSelection?: DocumentSelection
  readonly initialValue: DocumentState
}

interface StoryPlaygroundAcceptanceHarnessProps {
  readonly initialValue: DocumentState
}

function StoryPlaygroundAcceptanceHarness(props: StoryPlaygroundAcceptanceHarnessProps) {
  const [document, setDocument] = useState<DocumentState>(props.initialValue)
  const [activityCount, setActivityCount] = useState(0)
  const blockCount = Math.max(0, Object.keys(document.blocks).length - 1)
  const rootBlockCount = document.children[document.rootId]?.length ?? 0
  const handleChange = useCallback((nextDocument: DocumentState) => {
    setDocument(nextDocument)
    setActivityCount((current) => current + 1)
  }, [])

  return (
    <div style={acceptanceLayoutStyle}>
      <section aria-label="Editor acceptance surface" style={acceptanceEditorFrameStyle}>
        <EditorRoot
          blocks={basicBlocks}
          className={editorClassName}
          initialValue={props.initialValue}
          onChange={handleChange}
        />
      </section>
      <aside aria-label="Playground interaction acceptance" style={acceptancePanelStyle}>
        <header>
          <p className="vetra-storybook-eyebrow">Playground-like acceptance</p>
          <h2 style={{ fontSize: 15, margin: '2px 0 0' }}>Runtime inspector preview</h2>
        </header>
        <dl aria-label="Story document activity" style={acceptanceStatsStyle}>
          <div style={acceptanceStatItemStyle}>
            <dt style={acceptanceLabelStyle}>Version</dt>
            <dd style={acceptanceValueStyle}>{document.version}</dd>
          </div>
          <div style={acceptanceStatItemStyle}>
            <dt style={acceptanceLabelStyle}>Changes</dt>
            <dd style={acceptanceValueStyle}>{activityCount}</dd>
          </div>
          <div style={acceptanceStatItemStyle}>
            <dt style={acceptanceLabelStyle}>Blocks</dt>
            <dd style={acceptanceValueStyle}>{blockCount}</dd>
          </div>
          <div style={acceptanceStatItemStyle}>
            <dt style={acceptanceLabelStyle}>Root</dt>
            <dd style={acceptanceValueStyle}>{rootBlockCount}</dd>
          </div>
        </dl>
        <dl aria-label="Interaction acceptance checklist" className="vetra-demo-shortcuts">
          <div>
            <dt>/</dt>
            <dd>Open slash menu from the active inline editor.</dd>
          </div>
          <div>
            <dt>+</dt>
            <dd>Insert a paragraph from the gutter and keep focus in the new block.</dd>
          </div>
          <div>
            <dt>Drag</dt>
            <dd>Move root-level blocks with visible drop feedback.</dd>
          </div>
        </dl>
      </aside>
    </div>
  )
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
