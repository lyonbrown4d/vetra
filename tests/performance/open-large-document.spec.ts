import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance as nodePerformance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

type BenchmarkFixtureName =
  | 'blocks-1k'
  | 'blocks-10k'
  | 'blocks-50k'
  | 'mixed-content'
  | 'code-heavy'
  | 'image-heavy'
  | 'deep-nested'

interface BenchmarkCase {
  readonly fixture: BenchmarkFixtureName
  readonly expectedBlockCount: number
  readonly expectedRootBlockCount: number
  readonly measureActiveEditorCount?: boolean
  readonly measureFastScroll?: boolean
}

interface BenchmarkDomSnapshot {
  readonly blockCount: number
  readonly rootBlockCount: number
  readonly mountedBlockCount: number
  readonly mountedBlockDomCount: number
}

interface ActiveEditorMetrics {
  readonly activeBlockShellCount: number
  readonly activeEditorInstanceCount: number
}

interface FastScrollMetrics {
  readonly durationMs: number
  readonly finalScrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
  readonly mountedBlockCountAfterScroll: number
}

interface BenchmarkSample {
  readonly sampleIndex: number
  readonly initialRenderMs: number
  readonly blockCount: number
  readonly rootBlockCount: number
  readonly mountedBlockCount: number
  readonly mountedBlockDomCount: number
  readonly activeEditorInstanceCount: number
  readonly activeEditorAfterSelection?: ActiveEditorMetrics
  readonly fastScroll?: FastScrollMetrics
}

interface BenchmarkSummary {
  readonly initialRenderMsMedian: number | null
  readonly mountedBlockCountMedian: number | null
  readonly mountedBlockDomCountMedian: number | null
  readonly activeEditorInstanceCountMedian: number | null
  readonly activeEditorAfterSelectionMedian?: number | null
  readonly fastScrollDurationMsMedian?: number | null
}

interface BenchmarkResult {
  readonly fixture: BenchmarkFixtureName
  readonly expectedBlockCount: number
  readonly expectedRootBlockCount: number
  readonly sampleCount: number
  readonly samples: readonly BenchmarkSample[]
  readonly summary: BenchmarkSummary
}

interface PerformanceBenchmarkReport {
  readonly schemaVersion: 1
  readonly generatedAt: string
  readonly sampleCount: number
  readonly environment: {
    readonly projectName: string
    readonly browserName: string
    readonly nodeVersion: string
    readonly baseURL: string
    readonly viewport: {
      readonly width: number
      readonly height: number
    } | null
  }
  readonly benchmarks: readonly BenchmarkResult[]
}

const benchmarkCases: readonly BenchmarkCase[] = [
  {
    fixture: 'blocks-1k',
    expectedBlockCount: 1_000,
    expectedRootBlockCount: 1_000,
    measureActiveEditorCount: true,
  },
  {
    fixture: 'blocks-10k',
    expectedBlockCount: 10_000,
    expectedRootBlockCount: 10_000,
  },
  {
    fixture: 'blocks-50k',
    expectedBlockCount: 50_000,
    expectedRootBlockCount: 50_000,
    measureFastScroll: true,
  },
  {
    fixture: 'mixed-content',
    expectedBlockCount: 2_000,
    expectedRootBlockCount: 2_000,
  },
  {
    fixture: 'code-heavy',
    expectedBlockCount: 1_500,
    expectedRootBlockCount: 1_500,
  },
  {
    fixture: 'image-heavy',
    expectedBlockCount: 1_000,
    expectedRootBlockCount: 1_000,
  },
  {
    fixture: 'deep-nested',
    expectedBlockCount: 1_000,
    expectedRootBlockCount: 100,
  },
]

const rootDirectory = fileURLToPath(new URL('../..', import.meta.url))
const reportDirectory = path.join(rootDirectory, 'test-results', 'performance')
const reportPath = path.join(reportDirectory, 'benchmark-report.json')

test.describe.configure({ mode: 'serial' })
test.setTimeout(240_000)

test('records deterministic large-document benchmark metrics', async ({
  baseURL,
  browserName,
  page,
}, testInfo) => {
  const sampleCount = getSampleCount()
  const benchmarks: BenchmarkResult[] = []

  for (const benchmarkCase of benchmarkCases) {
    const samples: BenchmarkSample[] = []

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      samples.push(await measureBenchmarkSample(page, benchmarkCase, sampleIndex))
    }

    benchmarks.push({
      fixture: benchmarkCase.fixture,
      expectedBlockCount: benchmarkCase.expectedBlockCount,
      expectedRootBlockCount: benchmarkCase.expectedRootBlockCount,
      sampleCount,
      samples,
      summary: summarizeSamples(samples),
    })
  }

  const viewport = page.viewportSize()
  const report: PerformanceBenchmarkReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sampleCount,
    environment: {
      projectName: testInfo.project.name,
      browserName,
      nodeVersion: process.version,
      baseURL: baseURL ?? 'http://127.0.0.1:5173',
      viewport,
    },
    benchmarks,
  }

  await mkdir(reportDirectory, { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await testInfo.attach('performance-benchmark-report', {
    path: reportPath,
    contentType: 'application/json',
  })
})

async function measureBenchmarkSample(
  page: Page,
  benchmarkCase: BenchmarkCase,
  sampleIndex: number,
): Promise<BenchmarkSample> {
  const startedAt = nodePerformance.now()

  await page.goto(`/?benchmark=${benchmarkCase.fixture}`)

  const editor = page.getByLabel('Vetra editor demo')
  await expect(editor).toBeVisible({ timeout: 60_000 })
  await expect(editor).toHaveAttribute('data-vetra-benchmark-fixture', benchmarkCase.fixture, {
    timeout: 60_000,
  })
  await page.waitForFunction(
    () => document.querySelectorAll('.vetra-virtual-list__item').length > 0,
    undefined,
    { timeout: 60_000 },
  )
  await settleFrames(page)

  const initialRenderMs = nodePerformance.now() - startedAt
  const domSnapshot = await readDomSnapshot(editor)

  expect(domSnapshot.blockCount).toBe(benchmarkCase.expectedBlockCount)
  expect(domSnapshot.rootBlockCount).toBe(benchmarkCase.expectedRootBlockCount)

  const activeEditorInstanceCount = await countActiveEditorInstances(page)
  const activeEditorAfterSelection =
    benchmarkCase.measureActiveEditorCount === true
      ? await measureActiveEditorAfterSelection(page)
      : undefined
  const fastScroll =
    benchmarkCase.measureFastScroll === true ? await measureFastScroll(page) : undefined

  return {
    sampleIndex,
    initialRenderMs,
    blockCount: domSnapshot.blockCount,
    rootBlockCount: domSnapshot.rootBlockCount,
    mountedBlockCount: domSnapshot.mountedBlockCount,
    mountedBlockDomCount: domSnapshot.mountedBlockDomCount,
    activeEditorInstanceCount,
    ...(activeEditorAfterSelection === undefined ? {} : { activeEditorAfterSelection }),
    ...(fastScroll === undefined ? {} : { fastScroll }),
  }
}

async function readDomSnapshot(editor: Locator): Promise<BenchmarkDomSnapshot> {
  return editor.evaluate((element): BenchmarkDomSnapshot => {
    const readNumberAttribute = (name: string): number => {
      return Number(element.getAttribute(name) ?? '0')
    }

    return {
      blockCount: readNumberAttribute('data-vetra-benchmark-block-count'),
      rootBlockCount: readNumberAttribute('data-vetra-benchmark-root-block-count'),
      mountedBlockCount: readNumberAttribute('data-vetra-mounted-block-count'),
      mountedBlockDomCount: element.querySelectorAll('.vetra-virtual-list__item').length,
    }
  })
}

async function measureActiveEditorAfterSelection(page: Page): Promise<ActiveEditorMetrics> {
  await page.locator('[data-vetra-block-shell]').first().click()
  await expect(page.locator('[data-vetra-block-shell][data-active="true"]')).toHaveCount(1, {
    timeout: 10_000,
  })
  await settleFrames(page)

  return {
    activeBlockShellCount: await page
      .locator('[data-vetra-block-shell][data-active="true"]')
      .count(),
    activeEditorInstanceCount: await countActiveEditorInstances(page),
  }
}

async function measureFastScroll(page: Page): Promise<FastScrollMetrics> {
  const scroller = page.locator('.vetra-virtual-list')
  const scrollRun = await scroller.evaluate(
    async (element): Promise<Omit<FastScrollMetrics, 'mountedBlockCountAfterScroll'>> => {
      const waitForFrame = (): Promise<void> =>
        new Promise((resolve) => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
      const startedAt = performance.now()
      const steps = 12

      for (let step = 1; step <= steps; step += 1) {
        element.scrollTop = (maxScrollTop * step) / steps
        await waitForFrame()
      }

      await waitForFrame()

      return {
        durationMs: performance.now() - startedAt,
        finalScrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }
    },
  )
  await settleFrames(page)

  return {
    ...scrollRun,
    mountedBlockCountAfterScroll: await page.locator('.vetra-virtual-list__item').count(),
  }
}

async function countActiveEditorInstances(page: Page): Promise<number> {
  return page
    .locator('.vetra-inline-editor[contenteditable="true"], textarea.vetra-code-editor')
    .count()
}

async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const waitForFrame = (): Promise<void> =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          resolve()
        })
      })

    await waitForFrame()
    await waitForFrame()
  })
}

function summarizeSamples(samples: readonly BenchmarkSample[]): BenchmarkSummary {
  const activeEditorAfterSelectionMedian = median(
    samples
      .map((sample) => sample.activeEditorAfterSelection?.activeEditorInstanceCount)
      .filter(isNumber),
  )
  const fastScrollDurationMsMedian = median(
    samples.map((sample) => sample.fastScroll?.durationMs).filter(isNumber),
  )

  return {
    initialRenderMsMedian: median(samples.map((sample) => sample.initialRenderMs)),
    mountedBlockCountMedian: median(samples.map((sample) => sample.mountedBlockCount)),
    mountedBlockDomCountMedian: median(samples.map((sample) => sample.mountedBlockDomCount)),
    activeEditorInstanceCountMedian: median(
      samples.map((sample) => sample.activeEditorInstanceCount),
    ),
    ...(activeEditorAfterSelectionMedian === null ? {} : { activeEditorAfterSelectionMedian }),
    ...(fastScrollDurationMsMedian === null ? {} : { fastScrollDurationMsMedian }),
  }
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const highValue = sorted[middle]

  if (highValue === undefined) {
    return null
  }

  if (sorted.length % 2 === 1) {
    return highValue
  }

  const lowValue = sorted[middle - 1]

  return lowValue === undefined ? highValue : (lowValue + highValue) / 2
}

function isNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getSampleCount(): number {
  const rawSampleCount = process.env.VETRA_PERF_SAMPLES
  if (rawSampleCount === undefined) {
    return 1
  }

  const parsedSampleCount = Number.parseInt(rawSampleCount, 10)

  return Number.isFinite(parsedSampleCount) && parsedSampleCount > 0 ? parsedSampleCount : 1
}
