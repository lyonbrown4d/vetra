import {
  createCodeBlock,
  createDividerBlock,
  createHeadingBlock,
  createParagraphBlock,
  createQuoteBlock,
} from '@vetra/blocks-basic'
import {
  createDocument,
  createTextInlineContent,
  type BlockId,
  type DocBlock,
  type DocumentMeta,
  type DocumentState,
  type InlineContent,
} from '@vetra/core'

export interface BenchmarkFixtureDescriptor {
  readonly name: BenchmarkFixtureName
  readonly blockCount: number
  readonly rootBlockCount: number
  readonly description: string
}

export const benchmarkFixtureNames = [
  'blocks-1k',
  'blocks-10k',
  'blocks-50k',
  'mixed-content',
  'code-heavy',
  'image-heavy',
  'deep-nested',
] as const

export type BenchmarkFixtureName = (typeof benchmarkFixtureNames)[number]

export type PlaygroundFixtureId = 'playground-small' | BenchmarkFixtureName

export interface PlaygroundFixture {
  readonly id: PlaygroundFixtureId
  readonly label: string
  readonly description: string
  readonly blockCount: number
  readonly rootBlockCount: number
}

export const defaultPlaygroundFixtureId: PlaygroundFixtureId = 'playground-small'

const benchmarkFixtureDescriptors: readonly BenchmarkFixtureDescriptor[] = [
  {
    name: 'blocks-1k',
    blockCount: 1_000,
    rootBlockCount: 1_000,
    description: '1,000 deterministic paragraph blocks for first-screen render baselines.',
  },
  {
    name: 'blocks-10k',
    blockCount: 10_000,
    rootBlockCount: 10_000,
    description: '10,000 deterministic paragraph blocks for large document baselines.',
  },
  {
    name: 'blocks-50k',
    blockCount: 50_000,
    rootBlockCount: 50_000,
    description: '50,000 deterministic paragraph blocks for virtualization stress runs.',
  },
  {
    name: 'mixed-content',
    blockCount: 2_000,
    rootBlockCount: 2_000,
    description: 'Mixed headings, paragraphs, quotes, code blocks, and dividers.',
  },
  {
    name: 'code-heavy',
    blockCount: 1_500,
    rootBlockCount: 1_500,
    description: 'Code-focused fixture with deterministic language and content patterns.',
  },
  {
    name: 'image-heavy',
    blockCount: 1_000,
    rootBlockCount: 1_000,
    description:
      'Image-shaped blocks with deterministic props for future image renderer baselines.',
  },
  {
    name: 'deep-nested',
    blockCount: 1_000,
    rootBlockCount: 100,
    description: '100 top-level branches with 10-block deterministic nested chains.',
  },
]

export const playgroundFixtures: readonly PlaygroundFixture[] = [
  {
    id: defaultPlaygroundFixtureId,
    label: 'Playground small',
    description: 'Interactive 105-block playground document',
    blockCount: 105,
    rootBlockCount: 105,
  },
  ...benchmarkFixtureDescriptors.map((fixture) => ({
    id: fixture.name,
    label: fixture.name,
    description: fixture.description,
    blockCount: fixture.blockCount,
    rootBlockCount: fixture.rootBlockCount,
  })),
]

export function getBenchmarkFixtureDescriptors(): readonly BenchmarkFixtureDescriptor[] {
  return benchmarkFixtureDescriptors
}

export function getBenchmarkFixtureDescriptor(
  name: BenchmarkFixtureName,
): BenchmarkFixtureDescriptor {
  const descriptor = benchmarkFixtureDescriptors.find((candidate) => candidate.name === name)

  if (descriptor === undefined) {
    throw new Error(`Unknown benchmark fixture "${name}".`)
  }

  return descriptor
}

export function isBenchmarkFixtureName(value: string | null): value is BenchmarkFixtureName {
  return benchmarkFixtureNames.some((fixtureName) => fixtureName === value)
}

export function isPlaygroundFixtureId(value: string): value is PlaygroundFixtureId {
  return value === defaultPlaygroundFixtureId || isBenchmarkFixtureName(value)
}

export function isBenchmarkPlaygroundFixtureId(
  value: PlaygroundFixtureId,
): value is BenchmarkFixtureName {
  return isBenchmarkFixtureName(value)
}

export function getPlaygroundFixture(id: PlaygroundFixtureId): PlaygroundFixture {
  const fixture = playgroundFixtures.find((candidate) => candidate.id === id)

  if (fixture === undefined) {
    throw new Error(`Unknown playground fixture "${id}".`)
  }

  return fixture
}

export function createPlaygroundFixtureDocument(id: PlaygroundFixtureId): DocumentState {
  if (id === defaultPlaygroundFixtureId) {
    return createSmallPlaygroundFixtureDocument()
  }

  if (isBenchmarkPlaygroundFixtureId(id)) {
    return createBenchmarkFixtureDocument(id)
  }

  return createSmallPlaygroundFixtureDocument()
}

export function createPlaygroundDocument(): DocumentState {
  return createSmallPlaygroundFixtureDocument()
}

function createSmallPlaygroundFixtureDocument(): DocumentState {
  return createDocument({
    id: 'vetra-playground-document',
    blocks: [
      createHeadingBlock('intro-title', 1, 'Vetra'),
      createParagraphBlock('intro-body', 'A virtualized block editor runtime for large documents.'),
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
  })
}

export function createBenchmarkFixtureDocument(name: BenchmarkFixtureName): DocumentState {
  switch (name) {
    case 'blocks-1k':
      return createParagraphFixture(name, 1_000)
    case 'blocks-10k':
      return createParagraphFixture(name, 10_000)
    case 'blocks-50k':
      return createParagraphFixture(name, 50_000)
    case 'mixed-content':
      return createMixedContentFixture()
    case 'code-heavy':
      return createCodeHeavyFixture()
    case 'image-heavy':
      return createImageHeavyFixture()
    case 'deep-nested':
      return createDeepNestedFixture()
  }
}

function createParagraphFixture(name: BenchmarkFixtureName, count: number): DocumentState {
  return createDocument({
    id: `vetra-benchmark-${name}`,
    meta: createBenchmarkMeta(name),
    blocks: Array.from({ length: count }, (_, index) => {
      const ordinal = index + 1

      return createParagraphBlock(
        createFlatBlockId(name, ordinal),
        `Benchmark paragraph ${formatOrdinal(ordinal)} for ${name}. This content is deterministic.`,
      )
    }),
  })
}

function createMixedContentFixture(): DocumentState {
  const name = 'mixed-content'

  return createDocument({
    id: `vetra-benchmark-${name}`,
    meta: createBenchmarkMeta(name),
    blocks: Array.from({ length: 2_000 }, (_, index) => {
      const ordinal = index + 1
      const blockId = createFlatBlockId(name, ordinal)

      switch (index % 10) {
        case 0:
          return createHeadingBlock(
            blockId,
            ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
            ['Benchmark section', formatOrdinal(ordinal)].join(' '),
          )
        case 3:
          return createQuoteBlock(
            blockId,
            `Quoted deterministic benchmark note ${formatOrdinal(ordinal)}.`,
          )
        case 6:
          return createCodeBlock(blockId, createCodeSample(ordinal), 'ts')
        case 9:
          return createDividerBlock(blockId)
        default:
          return createParagraphBlock(
            blockId,
            `Mixed benchmark paragraph ${formatOrdinal(ordinal)} with stable content.`,
          )
      }
    }),
  })
}

function createCodeHeavyFixture(): DocumentState {
  const name = 'code-heavy'

  return createDocument({
    id: `vetra-benchmark-${name}`,
    meta: createBenchmarkMeta(name),
    blocks: Array.from({ length: 1_500 }, (_, index) => {
      const ordinal = index + 1
      const blockId = createFlatBlockId(name, ordinal)

      if (index % 8 === 0) {
        return createHeadingBlock(blockId, 2, `Code sample group ${formatOrdinal(ordinal)}`)
      }

      return createCodeBlock(blockId, createCodeSample(ordinal), index % 3 === 0 ? 'tsx' : 'ts')
    }),
  })
}

function createImageHeavyFixture(): DocumentState {
  const name = 'image-heavy'

  return createDocument({
    id: `vetra-benchmark-${name}`,
    meta: createBenchmarkMeta(name),
    blocks: Array.from({ length: 1_000 }, (_, index) => {
      const ordinal = index + 1

      return createImageBenchmarkBlock(createFlatBlockId(name, ordinal), ordinal)
    }),
  })
}

function createDeepNestedFixture(): DocumentState {
  const name = 'deep-nested'
  const rootId = 'root'
  const blocks: Record<BlockId, DocBlock> = {
    [rootId]: {
      id: rootId,
      type: 'root',
    },
  }
  const children: Record<BlockId, BlockId[]> = {
    [rootId]: [],
  }

  for (let branch = 1; branch <= 100; branch += 1) {
    let parentId = rootId

    for (let depth = 1; depth <= 10; depth += 1) {
      const blockId = `deep-${formatBranch(branch)}-${formatDepth(depth)}`
      const block =
        depth === 1
          ? createHeadingBlock(blockId, 3, `Nested branch ${formatBranch(branch)}`)
          : createParagraphBlock(
              blockId,
              `Nested benchmark branch ${formatBranch(branch)}, depth ${formatDepth(depth)}.`,
            )

      blocks[blockId] = block
      children[blockId] = []
      appendChild(children, parentId, blockId)
      parentId = blockId
    }
  }

  return {
    id: `vetra-benchmark-${name}`,
    version: 1,
    rootId,
    blocks,
    children,
    meta: createBenchmarkMeta(name),
  }
}

interface ImageBenchmarkBlock extends DocBlock {
  readonly type: 'image'
  readonly props: {
    readonly src: string
    readonly alt: string
    readonly width: number
    readonly height: number
    readonly caption: InlineContent
  }
}

function createImageBenchmarkBlock(id: BlockId, ordinal: number): ImageBenchmarkBlock {
  return {
    id,
    type: 'image',
    props: {
      src: `benchmark://image/${formatOrdinal(ordinal)}`,
      alt: `Benchmark image ${formatOrdinal(ordinal)}`,
      width: 960,
      height: 540 + (ordinal % 5) * 24,
      caption: createTextInlineContent(`Deterministic image caption ${formatOrdinal(ordinal)}.`),
    },
  }
}

function createBenchmarkMeta(name: BenchmarkFixtureName): DocumentMeta {
  const descriptor = getBenchmarkFixtureDescriptor(name)

  return {
    title: `Vetra benchmark ${name}`,
    benchmarkFixture: name,
    benchmarkBlockCount: descriptor.blockCount,
    benchmarkRootBlockCount: descriptor.rootBlockCount,
  }
}

function createCodeSample(ordinal: number): string {
  const formattedOrdinal = formatOrdinal(ordinal)

  return [
    `export function benchmarkCase${formattedOrdinal}() {`,
    `  const blockId = 'code-heavy-${formattedOrdinal}'`,
    `  return editor.dispatch({ type: 'updateBlock', blockId, patch: { updatedAt: ${String(
      1_700_000_000 + ordinal,
    )} } })`,
    '}',
  ].join('\n')
}

function appendChild(
  children: Record<BlockId, BlockId[]>,
  parentId: BlockId,
  childId: BlockId,
): void {
  const childIds = children[parentId]
  if (childIds === undefined) {
    children[parentId] = [childId]
    return
  }

  childIds.push(childId)
}

function createFlatBlockId(name: BenchmarkFixtureName, ordinal: number): BlockId {
  return `${name}-${formatOrdinal(ordinal)}`
}

function formatOrdinal(value: number): string {
  return String(value).padStart(5, '0')
}

function formatBranch(value: number): string {
  return String(value).padStart(3, '0')
}

function formatDepth(value: number): string {
  return String(value).padStart(2, '0')
}
