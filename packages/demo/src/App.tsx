import { useMemo, useState } from 'react'
import { basicBlocks } from '@vetra/blocks-basic/react'
import {
  createCodeBlock,
  createDividerBlock,
  createHeadingBlock,
  createParagraphBlock,
  createQuoteBlock,
} from '@vetra/blocks-basic'
import { createDocument, type DocumentState } from '@vetra/core'
import { stringifyDocument } from '@vetra/persistence-json'
import { EditorRoot } from '@vetra/react'

export function App() {
  const initialDocument = useMemo(
    () =>
      createDocument({
        id: 'vetra-demo-document',
        blocks: [
          createHeadingBlock('intro-title', 1, 'Vetra'),
          createParagraphBlock(
            'intro-body',
            'A virtualized block editor runtime for large documents.',
          ),
          createQuoteBlock('design-quote', 'Core stays framework-agnostic. React renders first.'),
          createCodeBlock(
            'sample-code',
            "editor.dispatch({ type: 'insertBlock', parentId, block })",
            'ts',
          ),
          createDividerBlock('divider-a'),
          ...Array.from({ length: 100 }, (_, index) =>
            createParagraphBlock(
              `benchmark-${String(index)}`,
              `Virtualized paragraph ${String(index + 1)}`,
            ),
          ),
        ],
      }),
    [],
  )
  const [document, setDocument] = useState<DocumentState>(initialDocument)

  return (
    <main className="vetra-demo-shell">
      <aside className="vetra-demo-sidebar">
        <h1>Vetra</h1>
        <dl>
          <div>
            <dt>Blocks</dt>
            <dd>{Object.keys(document.blocks).length - 1}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{document.version}</dd>
          </div>
        </dl>
        <textarea
          aria-label="Serialized Vetra document"
          readOnly
          value={stringifyDocument(document, 2)}
        />
      </aside>
      <section className="vetra-demo-editor" aria-label="Vetra editor demo">
        <EditorRoot blocks={basicBlocks} initialValue={initialDocument} onChange={setDocument} />
      </section>
    </main>
  )
}
