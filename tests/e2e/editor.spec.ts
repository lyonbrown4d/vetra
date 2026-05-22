import { expect, type Locator, type Page, test } from '@playwright/test'

interface SerializedVetraDocument {
  readonly format: string
  readonly version: number
  readonly document: VetraDocumentState
}

interface VetraDocumentState {
  readonly id: string
  readonly version: number
  readonly rootId: string
  readonly blocks: Readonly<Record<string, VetraBlock>>
  readonly children: Readonly<Record<string, readonly string[]>>
}

interface VetraBlock {
  readonly id: string
  readonly type: string
  readonly props?: Readonly<Record<string, unknown>>
  readonly content?: unknown
}

test.describe('Vetra demo editor main editing path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('complementary').getByRole('heading', { name: 'Vetra' }),
    ).toBeVisible()
    await expect(editorSurface(page)).toBeVisible()
  })

  test('activates a block and converts it from the toolbar', async ({ page }) => {
    const blockId = 'intro-body'
    const before = await readSerializedDocument(page)

    await activateBlock(page, blockId)
    await expect(activeInlineEditor(page)).toBeVisible()

    const toolbar = page.getByRole('toolbar', { name: 'Block toolbar' })
    await expect(toolbar.getByRole('button', { name: 'Paragraph' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await toolbar.getByRole('button', { name: 'H2' }).click()

    const after = await waitForSerializedDocument(page, (serialized) => {
      const block = serialized.document.blocks[blockId]

      return block?.type === 'heading' && block.props?.level === 2
    })
    const convertedBlock = expectBlock(after, blockId)

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(readBlockPlainText(convertedBlock)).toBe(
      'A virtualized block editor runtime for large documents.',
    )
    await expect(toolbar.getByRole('button', { name: 'H2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('opens the slash menu and inserts a selected block after the active block', async ({
    page,
  }) => {
    const anchorBlockId = 'design-quote'
    const before = await readSerializedDocument(page)
    const beforeChildren = getRootChildren(before)

    await activateBlock(page, anchorBlockId)
    const virtualListTopBeforeMenu = await readLocatorTop(virtualList(page))
    await openSlashMenuFromActiveBlock(page)

    const slashMenu = page.getByRole('menu', { name: 'Slash menu' })
    await expect(slashMenu).toBeVisible()
    await expect(slashMenu).toHaveAttribute('data-floating', 'true')
    await expect(slashMenu).toHaveCSS('position', 'fixed')
    await expect(slashMenu.getByRole('menuitem', { name: /Code/ })).toBeVisible()
    await expect
      .poll(async () => readLocatorTop(virtualList(page)))
      .toBeCloseTo(virtualListTopBeforeMenu, 0)

    await slashMenu.getByRole('menuitem', { name: /Code/ }).click()

    const after = await waitForSerializedDocument(page, (serialized) => {
      const insertedBlock = findBlockAfter(serialized, anchorBlockId)

      return insertedBlock?.type === 'code'
    })
    const insertedBlock = expectDefined(findBlockAfter(after, anchorBlockId))

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(getRootChildren(after)).toHaveLength(beforeChildren.length + 1)
    expect(insertedBlock.content).toBe('')
    await expect(page.getByLabel('Code block')).toBeVisible()
  })

  test('inserts a paragraph after a block from the gutter plus button', async ({ page }) => {
    const anchorBlockId = 'intro-body'
    const before = await readSerializedDocument(page)
    const beforeChildren = getRootChildren(before)

    await blockRow(page, anchorBlockId).hover()
    await blockPlusButton(page, anchorBlockId).click()

    const after = await waitForSerializedDocument(page, (serialized) => {
      const insertedBlock = findBlockAfter(serialized, anchorBlockId)

      return insertedBlock?.type === 'paragraph' && readBlockPlainText(insertedBlock) === ''
    })
    const insertedBlock = expectDefined(findBlockAfter(after, anchorBlockId))

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(getRootChildren(after)).toHaveLength(beforeChildren.length + 1)
    expect(readBlockPlainText(insertedBlock)).toBe('')
    await expect(blockShell(page, insertedBlock.id)).toHaveAttribute('data-active', 'true')
  })

  test('pastes plain text into multiple blocks and updates the serialized document', async ({
    page,
  }) => {
    const anchorBlockId = 'sample-code'
    const before = await readSerializedDocument(page)
    const beforeChildren = getRootChildren(before)

    await activateBlock(page, anchorBlockId)
    await pastePlainText(page, 'First pasted paragraph\nwrapped line\n\nSecond pasted paragraph')

    const after = await waitForSerializedDocument(page, (serialized) => {
      const insertedBlocks = findBlocksAfter(serialized, anchorBlockId, 2)
      const firstInsertedBlock = insertedBlocks[0]
      const secondInsertedBlock = insertedBlocks[1]

      return (
        firstInsertedBlock !== undefined &&
        secondInsertedBlock !== undefined &&
        readBlockPlainText(firstInsertedBlock).includes('First pasted paragraph') &&
        readBlockPlainText(secondInsertedBlock) === 'Second pasted paragraph'
      )
    })
    const insertedBlocks = findBlocksAfter(after, anchorBlockId, 2)

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(getRootChildren(after)).toHaveLength(beforeChildren.length + 2)
    expect(readBlockPlainText(expectDefined(insertedBlocks[0]))).toBe(
      'First pasted paragraph\nwrapped line',
    )
    expect(readBlockPlainText(expectDefined(insertedBlocks[1]))).toBe('Second pasted paragraph')
  })

  test('splits a Lexical block with Enter and merges it back with Backspace', async ({ page }) => {
    const blockId = 'intro-body'
    const before = await readSerializedDocument(page)
    const beforeChildren = getRootChildren(before)
    const typedAfterSplit = 'Continued without clicking'

    await activateBlock(page, blockId)
    await splitActiveBlockAtEnd(page)

    await expect(activeInlineEditor(page)).toBeFocused()
    await page.keyboard.type(typedAfterSplit)

    const afterSplit = await waitForSerializedDocument(page, (serialized) => {
      const children = getRootChildren(serialized)
      const splitBlock = findBlockAfter(serialized, blockId)

      return (
        children.length === beforeChildren.length + 1 &&
        splitBlock?.type === 'paragraph' &&
        readBlockPlainText(splitBlock) === typedAfterSplit
      )
    })
    const splitBlock = expectDefined(findBlockAfter(afterSplit, blockId))

    expect(readBlockPlainText(expectBlock(afterSplit, blockId))).toBe(
      'A virtualized block editor runtime for large documents.',
    )
    expect(readBlockPlainText(splitBlock)).toBe(typedAfterSplit)

    await mergeActiveBlockBackward(page)

    const afterMerge = await waitForSerializedDocument(page, (serialized) => {
      const children = getRootChildren(serialized)

      return children.length === beforeChildren.length && !children.includes(splitBlock.id)
    })

    expect(readBlockPlainText(expectBlock(afterMerge, blockId))).toBe(
      `A virtualized block editor runtime for large documents.${typedAfterSplit}`,
    )
  })

  test('selects all top-level blocks, highlights the range, and deletes it', async ({ page }) => {
    const blockId = 'intro-body'
    const before = await readSerializedDocument(page)

    expect(getRootChildren(before).length).toBeGreaterThan(1)

    await activateBlock(page, blockId)
    await expect(activeInlineEditor(page)).toBeFocused()
    await activeInlineEditor(page).press('ControlOrMeta+A')

    for (const selectedBlockId of ['intro-title', 'intro-body', 'design-quote', 'sample-code']) {
      await expect(blockShell(page, selectedBlockId)).toHaveAttribute('data-selected', 'true')
    }
    await expect(activeInlineEditor(page)).toHaveCount(0)

    await page.keyboard.press('Delete')

    const after = await waitForSerializedDocument(page, (serialized) => {
      return getRootChildren(serialized).length === 0
    })

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(getRootChildren(after)).toEqual([])

    await page.keyboard.press('ControlOrMeta+Z')

    const afterUndo = await waitForSerializedDocument(page, (serialized) => {
      return getRootChildren(serialized).length === getRootChildren(before).length
    })

    expect(getRootChildren(afterUndo)).toEqual(getRootChildren(before))
  })

  test('keeps far virtualized blocks out of the initial DOM', async ({ page }) => {
    await expect(
      editorSurface(page).getByRole('button', { name: 'Virtualized paragraph 100' }),
    ).not.toBeVisible()
  })
})

function editorSurface(page: Page): Locator {
  return page.getByLabel('Vetra editor demo')
}

function serializedDocumentTextarea(page: Page): Locator {
  return page.getByLabel(/^(Serialized Vetra document|Vetra JSON document)$/)
}

function blockShell(page: Page, blockId: string): Locator {
  return page.locator(`[data-vetra-block-shell="${blockId}"]`)
}

function blockRow(page: Page, blockId: string): Locator {
  return page.locator(`[data-vetra-block-row="${blockId}"]`)
}

function blockPlusButton(page: Page, blockId: string): Locator {
  return page.locator(
    `[data-vetra-block-control-block-id="${blockId}"][data-vetra-block-control="insert-after"]`,
  )
}

function activeInlineEditor(page: Page): Locator {
  return page.locator('.vetra-inline-editor[contenteditable="true"]')
}

function editorRoot(page: Page): Locator {
  return page.locator('.vetra-editor-root')
}

function virtualList(page: Page): Locator {
  return page.locator('.vetra-virtual-list')
}

async function activateBlock(page: Page, blockId: string): Promise<void> {
  const shell = blockShell(page, blockId)

  await shell.click()
  await expect(shell).toHaveAttribute('data-active', 'true')
}

async function openSlashMenuFromActiveBlock(page: Page): Promise<void> {
  const editor = activeInlineEditor(page)

  await expect(editor).toBeVisible()
  await editor.press('/')
}

async function splitActiveBlockAtEnd(page: Page): Promise<void> {
  const editor = activeInlineEditor(page)

  await expect(editor).toBeVisible()
  await setActiveInlineEditorCaret(page, 'end')
  await editor.press('Enter')
}

async function mergeActiveBlockBackward(page: Page): Promise<void> {
  const editor = activeInlineEditor(page)

  await expect(editor).toBeVisible()
  await setActiveInlineEditorCaret(page, 'start')
  await editor.press('Backspace')
}

async function setActiveInlineEditorCaret(page: Page, position: 'start' | 'end'): Promise<void> {
  const editor = activeInlineEditor(page)

  await editor.evaluate((node, nextPosition) => {
    node.focus()

    const selection = window.getSelection()
    if (selection === null) {
      throw new Error('Expected browser selection to be available.')
    }

    const range = document.createRange()
    range.selectNodeContents(node)
    range.collapse(nextPosition === 'start')
    selection.removeAllRanges()
    selection.addRange(range)
  }, position)
  await expect(editor).toBeFocused()
}

async function pastePlainText(page: Page, text: string): Promise<void> {
  await editorRoot(page).evaluate((node, pastedText) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', pastedText)
    node.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    )
  }, text)
}

async function readLocatorTop(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()

  if (box === null) {
    throw new Error('Expected locator to have a bounding box.')
  }

  return box.y
}

async function waitForSerializedDocument(
  page: Page,
  predicate: (serialized: SerializedVetraDocument) => boolean,
): Promise<SerializedVetraDocument> {
  let lastSerialized: SerializedVetraDocument | undefined

  await expect
    .poll(async () => {
      lastSerialized = await readSerializedDocument(page)

      return predicate(lastSerialized)
    })
    .toBe(true)

  return expectDefined(lastSerialized)
}

async function readSerializedDocument(page: Page): Promise<SerializedVetraDocument> {
  await exportSerializedDocument(page)

  return parseSerializedDocument(await serializedDocumentTextarea(page).inputValue())
}

async function exportSerializedDocument(page: Page): Promise<void> {
  const exportJsonButton = page.getByRole('button', { name: 'Export JSON' })

  if ((await exportJsonButton.count()) === 0) {
    return
  }

  await exportJsonButton.click()
}

function parseSerializedDocument(json: string): SerializedVetraDocument {
  const parsed: unknown = JSON.parse(json)

  if (!isSerializedVetraDocument(parsed)) {
    throw new Error('Serialized Vetra document textarea did not contain a valid document.')
  }

  return parsed
}

function isSerializedVetraDocument(value: unknown): value is SerializedVetraDocument {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.format === 'string' &&
    typeof value.version === 'number' &&
    isVetraDocumentState(value.document)
  )
}

function isVetraDocumentState(value: unknown): value is VetraDocumentState {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.version === 'number' &&
    typeof value.rootId === 'string' &&
    isBlockMap(value.blocks) &&
    isChildrenMap(value.children)
  )
}

function isBlockMap(value: unknown): value is Readonly<Record<string, VetraBlock>> {
  return isRecord(value) && Object.values(value).every(isVetraBlock)
}

function isVetraBlock(value: unknown): value is VetraBlock {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    (value.props === undefined || isRecord(value.props))
  )
}

function isChildrenMap(value: unknown): value is Readonly<Record<string, readonly string[]>> {
  return isRecord(value) && Object.values(value).every(isStringArray)
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRootChildren(serialized: SerializedVetraDocument): readonly string[] {
  return serialized.document.children[serialized.document.rootId] ?? []
}

function expectBlock(serialized: SerializedVetraDocument, blockId: string): VetraBlock {
  return expectDefined(serialized.document.blocks[blockId])
}

function findBlockAfter(
  serialized: SerializedVetraDocument,
  referenceBlockId: string,
): VetraBlock | undefined {
  return findBlocksAfter(serialized, referenceBlockId, 1)[0]
}

function findBlocksAfter(
  serialized: SerializedVetraDocument,
  referenceBlockId: string,
  count: number,
): readonly VetraBlock[] {
  const children = getRootChildren(serialized)
  const referenceIndex = children.indexOf(referenceBlockId)

  if (referenceIndex < 0) {
    return []
  }

  return children
    .slice(referenceIndex + 1, referenceIndex + 1 + count)
    .map((blockId) => serialized.document.blocks[blockId])
    .filter(isDefined)
}

function readBlockPlainText(block: VetraBlock): string {
  if (typeof block.content === 'string') {
    return block.content
  }

  return readInlineContentPlainText(block.content)
}

function readInlineContentPlainText(content: unknown): string {
  if (!isRecord(content) || content.type !== 'inline-content' || !Array.isArray(content.children)) {
    return ''
  }

  return content.children.map(readInlineNodePlainText).join('')
}

function readInlineNodePlainText(node: unknown): string {
  if (!isRecord(node) || typeof node.type !== 'string') {
    return ''
  }

  if (node.type === 'text' || node.type === 'inline-code') {
    return typeof node.text === 'string' ? node.text : ''
  }

  if (node.type === 'mention') {
    return typeof node.label === 'string' ? node.label : ''
  }

  if (node.type === 'link' && Array.isArray(node.children)) {
    return node.children.map(readInlineNodePlainText).join('')
  }

  return ''
}

function expectDefined<T>(value: T | undefined): T {
  expect(value).toBeDefined()

  if (value === undefined) {
    throw new Error('Expected value to be defined.')
  }

  return value
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
