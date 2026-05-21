import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react'
import { basicBlocks } from '@vetra/blocks-basic/react'
import type { DocumentState } from '@vetra/core'
import { documentToMarkdown } from '@vetra/export-markdown'
import { documentToPlainText } from '@vetra/export-plain-text'
import { markdownToDocument } from '@vetra/import-markdown'
import { plainTextToDocument } from '@vetra/import-plain-text'
import { parseDocument, stringifyDocument } from '@vetra/persistence-json'
import { EditorRoot } from '@vetra/react'
import {
  createPlaygroundFixtureDocument,
  defaultPlaygroundFixtureId,
  getPlaygroundFixture,
  isBenchmarkPlaygroundFixtureId,
  isPlaygroundFixtureId,
  playgroundFixtures,
  type BenchmarkFixtureName,
  type PlaygroundFixtureId,
} from '@vetra/playground/fixtures/benchmark'

declare const __VETRA_REACT_SCAN_ENABLED__: boolean
declare const __VETRA_REACT_SCAN_REASON__: string

interface ToolStatus {
  readonly tone: 'idle' | 'success' | 'error'
  readonly message: string
}

type ExchangePanel = 'json' | 'plain-text' | 'markdown'
type LoadedDocumentSource = PlaygroundFixtureId | 'custom'

const idleStatus: ToolStatus = {
  tone: 'idle',
  message: 'Ready',
}

const exchangePanels: readonly {
  readonly id: ExchangePanel
  readonly label: string
  readonly description: string
}[] = [
  {
    id: 'json',
    label: 'JSON',
    description: 'Internal Vetra persistence format.',
  },
  {
    id: 'plain-text',
    label: 'Plain text',
    description: 'Caller-owned plain text import strategy.',
  },
  {
    id: 'markdown',
    label: 'Markdown',
    description: 'Optional external format adapter.',
  },
]

const capabilityRows: readonly {
  readonly label: string
  readonly value: string
}[] = [
  { label: 'Core runtime', value: 'framework-agnostic' },
  { label: 'Renderer', value: 'React + TanStack Virtual' },
  { label: 'Inline editor', value: 'single active Lexical block' },
  { label: 'Mutation path', value: 'command / transaction' },
  { label: 'Persistence', value: 'versioned DocumentState JSON' },
  { label: 'Adapters', value: 'plain text and Markdown packages' },
  { label: 'React Scan', value: 'dev-only render instrumentation' },
]

const shortcutRows: readonly {
  readonly keys: string
  readonly action: string
}[] = [
  { keys: '/', action: 'Open slash menu' },
  { keys: 'Ctrl/Cmd + Z', action: 'Undo document change' },
  { keys: 'Ctrl/Cmd + Shift + Z', action: 'Redo document change' },
  { keys: 'Ctrl/Cmd + A', action: 'Select all top-level blocks from block focus' },
  { keys: 'Enter', action: 'Split active block' },
  { keys: 'Backspace', action: 'Merge with previous block at start' },
  { keys: 'Esc', action: 'Return to block selection' },
  { keys: 'Up / Down', action: 'Move block selection' },
  { keys: 'Delete', action: 'Delete selected block or block range' },
]

const apiSnippet = [
  "import { EditorRoot } from '@vetra/react'",
  "import { basicBlocks } from '@vetra/blocks-basic/react'",
  '',
  '<EditorRoot',
  '  initialValue={document}',
  '  blocks={basicBlocks}',
  '  onChange={(nextDocument) => setDocument(nextDocument)}',
  '/>',
].join('\n')

export function App() {
  const initialFixtureId = useMemo(() => getRequestedPlaygroundFixtureId(), [])
  const initialDocument = useMemo(
    () => createPlaygroundFixtureDocument(initialFixtureId),
    [initialFixtureId],
  )
  const [selectedFixtureId, setSelectedFixtureId] = useState<PlaygroundFixtureId>(initialFixtureId)
  const [loadedDocumentSource, setLoadedDocumentSource] =
    useState<LoadedDocumentSource>(initialFixtureId)
  const [editorSeed, setEditorSeed] = useState<DocumentState>(initialDocument)
  const [editorResetKey, setEditorResetKey] = useState(0)
  const [document, setDocument] = useState<DocumentState>(initialDocument)
  const [jsonText, setJsonText] = useState(() =>
    createJsonPanelText(initialDocument, initialFixtureId),
  )
  const [plainText, setPlainText] = useState(() =>
    createPlainTextPanelText(initialDocument, initialFixtureId),
  )
  const [markdownText, setMarkdownText] = useState(() =>
    createMarkdownPanelText(initialDocument, initialFixtureId),
  )
  const [activeExchangePanel, setActiveExchangePanel] = useState<ExchangePanel>('json')
  const [status, setStatus] = useState<ToolStatus>(idleStatus)
  const editorRegionRef = useRef<HTMLElement | null>(null)
  const editorDomMetrics = useEditorDomMetrics(editorRegionRef)
  const selectedFixture = getPlaygroundFixture(selectedFixtureId)
  const loadedFixture =
    loadedDocumentSource === 'custom' ? undefined : getPlaygroundFixture(loadedDocumentSource)
  const blockCount = Math.max(0, Object.keys(document.blocks).length - 1)
  const rootBlockCount = document.children[document.rootId]?.length ?? 0
  const mountedBlockCount = editorDomMetrics.mountedBlockCount
  const activeEditorCount = editorDomMetrics.activeEditorCount
  const virtualizationRatio =
    rootBlockCount > 0 ? Math.min(1, mountedBlockCount / rootBlockCount) : 0
  const activeExchangeDefinition = getExchangePanel(activeExchangePanel)
  const reactScanRows = useMemo(
    () =>
      [
        {
          label: 'Status',
          value: __VETRA_REACT_SCAN_ENABLED__ ? 'Enabled' : 'Disabled',
        },
        {
          label: 'Scope',
          value: __VETRA_REACT_SCAN_REASON__,
        },
        {
          label: 'Toggle',
          value: 'Set VETRA_REACT_SCAN=false before pnpm dev to disable local scanning.',
        },
      ] as const,
    [],
  )

  const syncTextareas = useCallback((nextDocument: DocumentState, source: LoadedDocumentSource) => {
    setJsonText(createJsonPanelText(nextDocument, source))
    setPlainText(createPlainTextPanelText(nextDocument, source))
    setMarkdownText(createMarkdownPanelText(nextDocument, source))
  }, [])

  const loadDocument = useCallback(
    (
      nextDocument: DocumentState,
      message: string,
      source: LoadedDocumentSource = selectedFixtureId,
    ) => {
      setEditorSeed(nextDocument)
      setDocument(nextDocument)
      setLoadedDocumentSource(source)
      setEditorResetKey((current) => current + 1)
      syncTextareas(nextDocument, source)
      setStatus({ tone: 'success', message })
    },
    [selectedFixtureId, syncTextareas],
  )

  const handleEditorChange = useCallback((nextDocument: DocumentState) => {
    setDocument(nextDocument)
  }, [])

  const handleFixtureChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextFixtureId = event.target.value

    if (isPlaygroundFixtureId(nextFixtureId)) {
      setSelectedFixtureId(nextFixtureId)
      setStatus({
        tone: 'idle',
        message: `${getPlaygroundFixture(nextFixtureId).label} fixture selected`,
      })
    }
  }, [])

  const handleLoadFixture = useCallback(() => {
    loadDocument(
      createPlaygroundFixtureDocument(selectedFixtureId),
      `${selectedFixture.label} fixture loaded`,
      selectedFixtureId,
    )
  }, [loadDocument, selectedFixture.label, selectedFixtureId])

  const handleResetDocument = useCallback(() => {
    loadDocument(
      createPlaygroundFixtureDocument(selectedFixtureId),
      `Document reset to ${selectedFixture.label} fixture`,
      selectedFixtureId,
    )
  }, [loadDocument, selectedFixture.label, selectedFixtureId])

  const handleExportJson = useCallback(() => {
    setJsonText(stringifyDocument(document, 2))
    setStatus({ tone: 'success', message: 'Current document exported as JSON' })
  }, [document])

  const handleLoadJson = useCallback(() => {
    const parsedDocument = parseDocument(jsonText)

    if (!parsedDocument.ok) {
      setStatus({ tone: 'error', message: parsedDocument.error.message })
      return
    }

    loadDocument(parsedDocument.value, 'JSON document loaded', 'custom')
  }, [jsonText, loadDocument])

  const handleExportPlainText = useCallback(() => {
    setPlainText(documentToPlainText(document))
    setStatus({ tone: 'success', message: 'Current document exported as plain text' })
  }, [document])

  const handleImportPlainText = useCallback(() => {
    loadDocument(
      plainTextToDocument(plainText, {
        documentId: 'vetra-playground-plain-text',
        idFactory: ({ index }) => `plain-text-${String(index + 1)}`,
      }),
      'Plain text imported',
      'custom',
    )
  }, [loadDocument, plainText])

  const handleExportMarkdown = useCallback(() => {
    setMarkdownText(documentToMarkdown(document))
    setStatus({ tone: 'success', message: 'Current document exported as Markdown' })
  }, [document])

  const handleImportMarkdown = useCallback(() => {
    try {
      loadDocument(
        markdownToDocument(markdownText, {
          documentId: 'vetra-playground-markdown',
          generateBlockId: ({ ordinal }) => `markdown-${String(ordinal)}`,
        }),
        'Markdown imported',
        'custom',
      )
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Markdown import failed',
      })
    }
  }, [loadDocument, markdownText])

  return (
    <main className="vetra-demo-shell">
      <aside className="vetra-demo-sidebar" aria-label="Vetra playground tools">
        <header className="vetra-demo-heading">
          <p className="vetra-demo-eyebrow">Playground</p>
          <h1>Vetra</h1>
          <p>Downstream integration workbench for the virtualized block editor runtime.</p>
        </header>

        <section className="vetra-demo-panel" aria-labelledby="fixture-panel-title">
          <div className="vetra-demo-panel__header">
            <h2 id="fixture-panel-title">Document fixture</h2>
            <span>{loadedFixture?.label ?? 'Custom document'} loaded</span>
          </div>
          <label className="vetra-demo-field">
            <span>Fixture</span>
            <select
              aria-label="Benchmark fixture"
              onChange={handleFixtureChange}
              value={selectedFixtureId}
            >
              {playgroundFixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.label} - {fixture.description}
                </option>
              ))}
            </select>
          </label>
          <div className="vetra-demo-fixture-card">
            <strong>{selectedFixture.label}</strong>
            <span>{selectedFixture.description}</span>
            <dl>
              <div>
                <dt>Blocks</dt>
                <dd>{formatNumber(selectedFixture.blockCount)}</dd>
              </div>
              <div>
                <dt>Root</dt>
                <dd>{formatNumber(selectedFixture.rootBlockCount)}</dd>
              </div>
            </dl>
          </div>
          <div className="vetra-demo-actions">
            <button onClick={handleLoadFixture} type="button">
              Load selected
            </button>
            <button onClick={handleResetDocument} type="button">
              Reset document
            </button>
          </div>
        </section>

        <section className="vetra-demo-panel" aria-labelledby="exchange-panel-title">
          <div className="vetra-demo-panel__header">
            <h2 id="exchange-panel-title">Import / export</h2>
            <span>{activeExchangeDefinition.description}</span>
          </div>

          <div
            aria-label="Import and export format"
            className="vetra-demo-segmented"
            role="tablist"
          >
            {exchangePanels.map((panel) => (
              <button
                aria-selected={activeExchangePanel === panel.id}
                key={panel.id}
                onClick={() => {
                  setActiveExchangePanel(panel.id)
                }}
                role="tab"
                type="button"
              >
                {panel.label}
              </button>
            ))}
          </div>

          {activeExchangePanel === 'json' ? (
            <div className="vetra-demo-exchange-pane" role="tabpanel">
              <div className="vetra-demo-actions">
                <button onClick={handleLoadJson} type="button">
                  Import JSON
                </button>
                <button onClick={handleExportJson} type="button">
                  Export JSON
                </button>
              </div>
              <textarea
                aria-label="Vetra JSON document"
                onChange={(event) => {
                  setJsonText(event.target.value)
                }}
                spellCheck={false}
                value={jsonText}
              />
            </div>
          ) : null}

          {activeExchangePanel === 'plain-text' ? (
            <div className="vetra-demo-exchange-pane" role="tabpanel">
              <div className="vetra-demo-actions">
                <button onClick={handleImportPlainText} type="button">
                  Import text
                </button>
                <button onClick={handleExportPlainText} type="button">
                  Export text
                </button>
              </div>
              <textarea
                aria-label="Plain text document"
                onChange={(event) => {
                  setPlainText(event.target.value)
                }}
                value={plainText}
              />
            </div>
          ) : null}

          {activeExchangePanel === 'markdown' ? (
            <div className="vetra-demo-exchange-pane" role="tabpanel">
              <div className="vetra-demo-actions">
                <button onClick={handleImportMarkdown} type="button">
                  Import Markdown
                </button>
                <button onClick={handleExportMarkdown} type="button">
                  Export Markdown
                </button>
              </div>
              <textarea
                aria-label="Markdown document"
                onChange={(event) => {
                  setMarkdownText(event.target.value)
                }}
                spellCheck={false}
                value={markdownText}
              />
            </div>
          ) : null}
        </section>

        <output
          aria-live="polite"
          className={`vetra-demo-status vetra-demo-status--${status.tone}`}
        >
          {status.message}
        </output>
      </aside>

      <section className="vetra-demo-workbench" aria-labelledby="workbench-title">
        <header className="vetra-demo-editor-bar">
          <div>
            <p className="vetra-demo-eyebrow">Live editor</p>
            <h2 id="workbench-title">Block document canvas</h2>
          </div>
          <dl aria-label="Editor quick stats" className="vetra-demo-quick-stats">
            <div>
              <dt>Blocks</dt>
              <dd>{formatNumber(blockCount)}</dd>
            </div>
            <div>
              <dt>Mounted</dt>
              <dd>{formatNumber(mountedBlockCount)}</dd>
            </div>
            <div>
              <dt>Active</dt>
              <dd>{formatNumber(activeEditorCount)}</dd>
            </div>
          </dl>
        </header>

        <section
          className="vetra-demo-editor"
          aria-label="Vetra editor demo"
          data-vetra-benchmark-block-count={blockCount}
          data-vetra-benchmark-fixture={loadedDocumentSource}
          data-vetra-benchmark-root-block-count={rootBlockCount}
          data-vetra-mounted-block-count={mountedBlockCount}
          ref={editorRegionRef}
        >
          <EditorRoot
            key={editorResetKey}
            blocks={basicBlocks}
            initialValue={editorSeed}
            onChange={handleEditorChange}
          />
        </section>
      </section>

      <section className="vetra-demo-inspector" aria-label="Vetra runtime inspector">
        <section className="vetra-demo-panel" aria-labelledby="runtime-panel-title">
          <div className="vetra-demo-panel__header">
            <h2 id="runtime-panel-title">Runtime stats</h2>
            <span>DocumentState and mounted DOM</span>
          </div>
          <dl className="vetra-demo-stats" aria-label="Document runtime stats">
            <div>
              <dt>Document blocks</dt>
              <dd>{formatNumber(blockCount)}</dd>
            </div>
            <div>
              <dt>Root blocks</dt>
              <dd>{formatNumber(rootBlockCount)}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{formatNumber(document.version)}</dd>
            </div>
            <div>
              <dt>Mounted blocks</dt>
              <dd>{formatNumber(mountedBlockCount)}</dd>
            </div>
            <div>
              <dt>Active editors</dt>
              <dd>{formatNumber(activeEditorCount)}</dd>
            </div>
            <div>
              <dt>Mounted ratio</dt>
              <dd>{formatPercent(virtualizationRatio)}</dd>
            </div>
          </dl>
        </section>

        <section className="vetra-demo-panel" aria-labelledby="react-scan-panel-title">
          <div className="vetra-demo-panel__header">
            <h2 id="react-scan-panel-title">React Scan</h2>
            <span>Live render instrumentation for playground development</span>
          </div>
          <dl className="vetra-demo-stats" aria-label="React Scan status">
            {reactScanRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="vetra-demo-panel" aria-labelledby="capabilities-panel-title">
          <div className="vetra-demo-panel__header">
            <h2 id="capabilities-panel-title">Capabilities</h2>
            <span>What downstream apps wire into</span>
          </div>
          <ul className="vetra-demo-capability-list">
            {capabilityRows.map((capability) => (
              <li key={capability.label}>
                <span aria-hidden="true" />
                <div>
                  <strong>{capability.label}</strong>
                  <small>{capability.value}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="vetra-demo-panel" aria-labelledby="api-panel-title">
          <div className="vetra-demo-panel__header">
            <h2 id="api-panel-title">API snippet</h2>
            <span>Minimal React renderer integration</span>
          </div>
          <pre className="vetra-demo-code-sample">
            <code>{apiSnippet}</code>
          </pre>
        </section>

        <section className="vetra-demo-panel" aria-labelledby="shortcuts-panel-title">
          <div className="vetra-demo-panel__header">
            <h2 id="shortcuts-panel-title">Keyboard shortcuts</h2>
            <span>Current playground bindings</span>
          </div>
          <dl className="vetra-demo-shortcuts">
            {shortcutRows.map((shortcut) => (
              <div key={shortcut.keys}>
                <dt>{shortcut.keys}</dt>
                <dd>{shortcut.action}</dd>
              </div>
            ))}
          </dl>
        </section>
      </section>
    </main>
  )
}

function getRequestedPlaygroundFixtureId(): PlaygroundFixtureId {
  const searchParams = new URLSearchParams(globalThis.location.search)
  const requestedFixture = searchParams.get('benchmark') ?? searchParams.get('fixture')

  if (requestedFixture === 'small' || requestedFixture === 'demo-small') {
    return defaultPlaygroundFixtureId
  }

  return requestedFixture !== null && isPlaygroundFixtureId(requestedFixture)
    ? requestedFixture
    : defaultPlaygroundFixtureId
}

function getExchangePanel(id: ExchangePanel): (typeof exchangePanels)[number] {
  const fallbackPanel = exchangePanels[0]
  if (fallbackPanel === undefined) {
    throw new Error('Vetra playground exchange panels are not configured.')
  }

  return exchangePanels.find((panel) => panel.id === id) ?? fallbackPanel
}

function createJsonPanelText(document: DocumentState, source: LoadedDocumentSource): string {
  if (isBenchmarkLoadedDocumentSource(source)) {
    return createBenchmarkPanelText(document, source, 'JSON export skipped during benchmark mode.')
  }

  return stringifyDocument(document, 2)
}

function createPlainTextPanelText(document: DocumentState, source: LoadedDocumentSource): string {
  if (isBenchmarkLoadedDocumentSource(source)) {
    return createBenchmarkPanelText(
      document,
      source,
      'Plain text export skipped during benchmark mode.',
    )
  }

  return documentToPlainText(document)
}

function createMarkdownPanelText(document: DocumentState, source: LoadedDocumentSource): string {
  if (isBenchmarkLoadedDocumentSource(source)) {
    return createBenchmarkPanelText(
      document,
      source,
      'Markdown export skipped during benchmark mode.',
    )
  }

  return documentToMarkdown(document)
}

function isBenchmarkLoadedDocumentSource(
  source: LoadedDocumentSource,
): source is BenchmarkFixtureName {
  return source !== 'custom' && isBenchmarkPlaygroundFixtureId(source)
}

function createBenchmarkPanelText(
  document: DocumentState,
  fixtureId: PlaygroundFixtureId,
  message: string,
): string {
  const fixture = getPlaygroundFixture(fixtureId)

  return [
    message,
    `Fixture: ${fixtureId}`,
    `Blocks: ${String(Math.max(0, Object.keys(document.blocks).length - 1))}`,
    `Root blocks: ${String(document.children[document.rootId]?.length ?? 0)}`,
    fixture.description,
  ].join('\n')
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(value)
}

interface EditorDomMetrics {
  readonly mountedBlockCount: number
  readonly activeEditorCount: number
}

function useEditorDomMetrics(ref: RefObject<HTMLElement | null>): EditorDomMetrics {
  const [metrics, setMetrics] = useState<EditorDomMetrics>({
    mountedBlockCount: 0,
    activeEditorCount: 0,
  })

  useEffect(() => {
    const element = ref.current
    if (element === null) {
      return undefined
    }

    const updateMetrics = () => {
      setMetrics({
        mountedBlockCount: element.querySelectorAll('.vetra-block').length,
        activeEditorCount: element.querySelectorAll('.vetra-inline-editor[contenteditable="true"]')
          .length,
      })
    }
    const observer = new MutationObserver(updateMetrics)

    updateMetrics()
    observer.observe(element, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [ref])

  return metrics
}
