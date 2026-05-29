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

const VETRA_BLOCK_CLIPBOARD_MIME_TYPE = 'application/x.vetra.blocks+json'

interface ClipboardEventSnapshot {
  readonly defaultPrevented: boolean
  readonly plainText: string
  readonly vetraBlocksJson: string
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

  test('uses keyboard navigation in the focused slash menu', async ({ page }) => {
    const anchorBlockId = 'design-quote'
    const before = await readSerializedDocument(page)

    await activateBlock(page, anchorBlockId)
    await openSlashMenuFromActiveBlock(page)

    const slashMenu = page.getByRole('menu', { name: 'Slash menu' })
    await expect(slashMenu).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    const after = await waitForSerializedDocument(page, (serialized) => {
      const insertedBlock = findBlockAfter(serialized, anchorBlockId)

      return insertedBlock?.type === 'heading' && insertedBlock.props?.level === 2
    })
    const insertedBlock = expectDefined(findBlockAfter(after, anchorBlockId))

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(insertedBlock.type).toBe('heading')
    await expect(slashMenu).toHaveCount(0)
    await expect(blockShell(page, insertedBlock.id)).toHaveAttribute('data-active', 'true')
  })

  test('inserts a paragraph after a block from the gutter plus button', async ({ page }) => {
    const anchorBlockId = 'intro-body'
    const before = await readSerializedDocument(page)
    const beforeChildren = getRootChildren(before)

    await blockRow(page, anchorBlockId).hover()
    await blockPlusButton(page, anchorBlockId).click()

    await expect(activeInlineEditor(page)).toBeFocused()
    await page.keyboard.type('Typed immediately after plus')

    const afterTyping = await waitForSerializedDocument(page, (serialized) => {
      const typedBlock = findBlockAfter(serialized, anchorBlockId)

      return (
        typedBlock?.type === 'paragraph' &&
        readBlockPlainText(typedBlock) === 'Typed immediately after plus'
      )
    })
    const insertedBlock = expectDefined(findBlockAfter(afterTyping, anchorBlockId))

    expect(afterTyping.document.version).toBeGreaterThan(before.document.version)
    expect(getRootChildren(afterTyping)).toHaveLength(beforeChildren.length + 1)
    await expect(blockShell(page, insertedBlock.id)).toHaveAttribute('data-active', 'true')
    expect(readBlockPlainText(expectDefined(findBlockAfter(afterTyping, anchorBlockId)))).toBe(
      'Typed immediately after plus',
    )
  })

  test('drags a root block with a separated virtual row and drag layer', async ({ page }) => {
    const draggedBlockId = 'intro-body'
    const targetBlockId = 'design-quote'
    const before = await readSerializedDocument(page)

    await blockRow(page, draggedBlockId).hover()
    const dragHandleBox = await readLocatorBox(blockDragHandle(page, draggedBlockId))
    const targetBox = await readLocatorBox(sortableBlock(page, targetBlockId))

    expect(await readInlineStyleTransform(sortableBlock(page, draggedBlockId))).toContain(
      'translateY(',
    )
    expect(await readInlineStyleTransform(sortableDragLayer(page, draggedBlockId))).not.toContain(
      'translateY(',
    )

    await page.mouse.move(
      dragHandleBox.x + dragHandleBox.width / 2,
      dragHandleBox.y + dragHandleBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height + 16, {
      steps: 10,
    })

    expect(await readInlineStyleTransform(sortableBlock(page, draggedBlockId))).toContain(
      'translateY(',
    )
    expect(await readInlineStyleTransform(sortableDragLayer(page, draggedBlockId))).not.toContain(
      'translateY(',
    )

    await page.mouse.up()

    const after = await waitForSerializedDocument(page, (serialized) => {
      const children = getRootChildren(serialized)

      return children.indexOf(draggedBlockId) > children.indexOf(targetBlockId)
    })
    const afterChildren = getRootChildren(after)

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(afterChildren.indexOf(draggedBlockId)).toBeGreaterThan(
      afterChildren.indexOf(targetBlockId),
    )
  })

  test('updates the playground inspector after editing a block', async ({ page }) => {
    const blockId = 'intro-body'
    const beforeVersion = await readInspectorDocumentVersion(page)
    const beforeActivityCount = await readInspectorActivityCount(page)

    await activateBlock(page, blockId)
    await expect(inspectorActiveBlockId(page)).toHaveAttribute(
      'data-vetra-inspector-active-block-id',
      blockId,
    )

    await setActiveInlineEditorCaret(page, 'end')
    await page.keyboard.type(' Inspector update')

    await expect.poll(async () => readInspectorDocumentVersion(page)).toBeGreaterThan(beforeVersion)
    await expect
      .poll(async () => readInspectorActivityCount(page))
      .toBeGreaterThan(beforeActivityCount)
    await expect(inspectorActiveBlockId(page)).toHaveAttribute(
      'data-vetra-inspector-active-block-id',
      blockId,
    )
    await expect(
      page.getByRole('list', { name: 'Activity log' }).locator('li').first(),
    ).toContainText('Editor document changed')
  })

  test('updates the active inline editor immediately after undo and redo', async ({ page }) => {
    const blockId = 'intro-body'
    const typedText = '!'

    await activateBlock(page, blockId)
    await setActiveInlineEditorCaret(page, 'end')
    await page.keyboard.type(typedText)

    await expect(activeInlineEditor(page)).toContainText(typedText)
    await waitForSerializedDocument(page, (serialized) => {
      return readBlockPlainText(expectBlock(serialized, blockId)).endsWith(typedText)
    })

    await activeInlineEditor(page).press('ControlOrMeta+Z')

    await expect(activeInlineEditor(page)).not.toContainText(typedText)
    await waitForSerializedDocument(page, (serialized) => {
      return !readBlockPlainText(expectBlock(serialized, blockId)).endsWith(typedText)
    })

    await activeInlineEditor(page).press('ControlOrMeta+Shift+Z')

    await expect(activeInlineEditor(page)).toContainText(typedText)
    await waitForSerializedDocument(page, (serialized) => {
      return readBlockPlainText(expectBlock(serialized, blockId)).endsWith(typedText)
    })
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

  test('replaces a selected block range when pasting plain text', async ({ page }) => {
    const before = await readSerializedDocument(page)
    const beforeChildren = getRootChildren(before)

    await activateBlock(page, 'intro-body')
    await blockShell(page, 'design-quote').click({ modifiers: ['Shift'] })
    await pastePlainText(page, 'Replacement paragraph')

    const after = await waitForSerializedDocument(page, (serialized) => {
      const children = getRootChildren(serialized)
      const replacementId = children[1]
      const replacementBlock =
        replacementId === undefined ? undefined : serialized.document.blocks[replacementId]

      return (
        children.length === beforeChildren.length - 1 &&
        !children.includes('intro-body') &&
        !children.includes('design-quote') &&
        replacementBlock?.type === 'paragraph' &&
        readBlockPlainText(replacementBlock) === 'Replacement paragraph'
      )
    })
    const children = getRootChildren(after)
    const replacementBlock = expectBlock(after, expectDefined(children[1]))

    expect(children[0]).toBe('intro-title')
    expect(readBlockPlainText(replacementBlock)).toBe('Replacement paragraph')
    expect(children[2]).toBe('sample-code')
  })

  test('pastes HTML clipboard data into imported blocks', async ({ page }) => {
    const anchorBlockId = 'sample-code'
    const before = await readSerializedDocument(page)
    const beforeChildren = getRootChildren(before)

    await activateBlock(page, anchorBlockId)
    await pasteHtml(page, '<h2>HTML pasted title</h2><p>HTML pasted body</p>', 'Plain fallback')

    const after = await waitForSerializedDocument(page, (serialized) => {
      const insertedBlocks = findBlocksAfter(serialized, anchorBlockId, 2)
      const headingBlock = insertedBlocks[0]
      const paragraphBlock = insertedBlocks[1]

      return (
        headingBlock?.type === 'heading' &&
        headingBlock.props?.level === 2 &&
        readBlockPlainText(headingBlock) === 'HTML pasted title' &&
        paragraphBlock?.type === 'paragraph' &&
        readBlockPlainText(paragraphBlock) === 'HTML pasted body'
      )
    })
    const insertedBlocks = findBlocksAfter(after, anchorBlockId, 2)

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(getRootChildren(after)).toHaveLength(beforeChildren.length + 2)
    expect(expectDefined(insertedBlocks[0]).type).toBe('heading')
    expect(readBlockPlainText(expectDefined(insertedBlocks[1]))).toBe('HTML pasted body')
  })

  test('copies a structured multi-block range and pastes it after the active block', async ({
    page,
  }) => {
    const before = await readSerializedDocument(page)
    const beforeChildren = getRootChildren(before)

    await activateBlock(page, 'intro-body')
    await blockShell(page, 'design-quote').click({ modifiers: ['Shift'] })

    await expect(blockShell(page, 'intro-body')).toHaveAttribute('data-selected', 'true')
    await expect(blockShell(page, 'design-quote')).toHaveAttribute('data-selected', 'true')

    const copied = await copyEditorSelection(page)

    expect(copied.defaultPrevented).toBe(true)
    expect(copied.vetraBlocksJson.length).toBeGreaterThan(0)
    expect(copied.plainText).toContain('A virtualized block editor runtime')
    expect(copied.plainText).toContain('Core stays framework-agnostic')

    const clipboardDocument = parseSerializedDocument(copied.vetraBlocksJson)
    expect(getRootChildren(clipboardDocument)).toEqual(['intro-body', 'design-quote'])

    await activateBlock(page, 'sample-code')

    const pasted = await pasteStructuredBlocks(page, copied.vetraBlocksJson)
    expect(pasted.defaultPrevented).toBe(true)

    const after = await waitForSerializedDocument(page, (serialized) => {
      const insertedBlocks = findBlocksAfter(serialized, 'sample-code', 2)
      const firstInsertedBlock = insertedBlocks[0]
      const secondInsertedBlock = insertedBlocks[1]

      return (
        firstInsertedBlock !== undefined &&
        secondInsertedBlock !== undefined &&
        firstInsertedBlock.type === 'paragraph' &&
        secondInsertedBlock.type === 'quote' &&
        readBlockPlainText(firstInsertedBlock) ===
          'A virtualized block editor runtime for large documents.' &&
        readBlockPlainText(secondInsertedBlock) ===
          'Core stays framework-agnostic. React renders first.'
      )
    })
    const insertedBlocks = findBlocksAfter(after, 'sample-code', 2)

    expect(after.document.version).toBeGreaterThan(before.document.version)
    expect(getRootChildren(after)).toHaveLength(beforeChildren.length + 2)
    expect(expectDefined(insertedBlocks[0]).id).toMatch(/^paste-/)
    expect(expectDefined(insertedBlocks[1]).id).toMatch(/^paste-/)
  })

  test('duplicates and moves a selected block range from the toolbar', async ({ page }) => {
    const before = await readSerializedDocument(page)

    await activateBlock(page, 'intro-body')
    await blockShell(page, 'design-quote').click({ modifiers: ['Shift'] })

    const toolbar = page.getByRole('toolbar', { name: 'Block toolbar' })
    await toolbar.getByRole('button', { name: 'Duplicate', exact: true }).click()

    const afterDuplicate = await waitForSerializedDocument(page, (serialized) => {
      const children = getRootChildren(serialized)

      return (
        children.includes('intro-body-copy') &&
        children.includes('design-quote-copy') &&
        children.indexOf('intro-body-copy') > children.indexOf('design-quote') &&
        children.indexOf('design-quote-copy') === children.indexOf('intro-body-copy') + 1
      )
    })

    expect(afterDuplicate.document.version).toBeGreaterThan(before.document.version)
    expect(readBlockPlainText(expectBlock(afterDuplicate, 'intro-body-copy'))).toBe(
      'A virtualized block editor runtime for large documents.',
    )
    await expect(blockShell(page, 'intro-body-copy')).toHaveAttribute('data-selected', 'true')
    await expect(blockShell(page, 'design-quote-copy')).toHaveAttribute('data-selected', 'true')

    await toolbar.getByRole('button', { name: 'Up', exact: true }).click()

    const afterMove = await waitForSerializedDocument(page, (serialized) => {
      const children = getRootChildren(serialized)

      return (
        children.indexOf('intro-body-copy') === children.indexOf('intro-body') + 1 &&
        children.indexOf('design-quote-copy') === children.indexOf('intro-body-copy') + 1 &&
        children.indexOf('design-quote') === children.indexOf('design-quote-copy') + 1
      )
    })

    expect(afterMove.document.version).toBeGreaterThan(afterDuplicate.document.version)
    await expect(blockShell(page, 'intro-body-copy')).toHaveAttribute('data-selected', 'true')
    await expect(blockShell(page, 'design-quote-copy')).toHaveAttribute('data-selected', 'true')
  })

  test('exports the current document as HTML from the exchange panel', async ({ page }) => {
    await exchangeFormatTab(page, 'HTML').click()
    await page.getByRole('button', { name: 'Export HTML' }).click()

    await expect(htmlDocumentTextarea(page)).toHaveValue(/<h1(?:\s|>)/i)
    await expect(htmlDocumentTextarea(page)).toHaveValue(/<p(?:\s|>)/i)
  })

  test('imports HTML inline code without splitting paragraph flow', async ({ page }) => {
    await exchangeFormatTab(page, 'HTML').click()
    await htmlDocumentTextarea(page).fill(
      '<div>Use <code>const value = 1</code> now</div><code class="language-js">console.log(1)</code>',
    )
    await page.getByRole('button', { name: 'Import HTML' }).click()

    await exchangeFormatTab(page, 'JSON').click()
    const after = await waitForSerializedDocument(page, (serialized) => {
      const children = getRootChildren(serialized)
      const firstBlock =
        children[0] === undefined ? undefined : serialized.document.blocks[children[0]]
      const secondBlock =
        children[1] === undefined ? undefined : serialized.document.blocks[children[1]]

      return (
        children.length === 2 &&
        firstBlock?.type === 'paragraph' &&
        readBlockPlainText(firstBlock) === 'Use const value = 1 now' &&
        secondBlock?.type === 'code' &&
        readBlockPlainText(secondBlock) === 'console.log(1)'
      )
    })
    const children = getRootChildren(after)

    expect(readBlockPlainText(expectBlock(after, expectDefined(children[0])))).toBe(
      'Use const value = 1 now',
    )
    expect(expectBlock(after, expectDefined(children[1])).type).toBe('code')
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

    await dispatchEditorKeydown(page, 'z', { ctrlKey: true })

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

function htmlDocumentTextarea(page: Page): Locator {
  return page.getByLabel('HTML document')
}

function exchangeFormatTab(page: Page, name: string): Locator {
  return page.getByRole('tab', { name })
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

function blockDragHandle(page: Page, blockId: string): Locator {
  return page.locator(`[data-vetra-block-drag-handle="${blockId}"]`)
}

function activeInlineEditor(page: Page): Locator {
  return page.locator('.vetra-inline-editor[contenteditable="true"]')
}

function sortableBlock(page: Page, blockId: string): Locator {
  return page.locator(`[data-vetra-sortable-block="${blockId}"]`)
}

function sortableDragLayer(page: Page, blockId: string): Locator {
  return page.locator(`[data-vetra-sortable-drag-layer="${blockId}"]`)
}

function editorRoot(page: Page): Locator {
  return page.locator('.vetra-editor-root')
}

function virtualList(page: Page): Locator {
  return page.locator('.vetra-virtual-list')
}

function inspectorActiveBlockId(page: Page): Locator {
  return page.locator('[data-vetra-inspector-active-block-id]')
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

async function pasteHtml(page: Page, html: string, plainText: string): Promise<void> {
  await editorRoot(page).evaluate(
    (node, payload) => {
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/html', payload.html)
      clipboardData.setData('text/plain', payload.plainText)
      node.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }),
      )
    },
    { html, plainText },
  )
}

async function copyEditorSelection(page: Page): Promise<ClipboardEventSnapshot> {
  return dispatchEditorClipboardEvent(page, 'copy', {})
}

async function pasteStructuredBlocks(
  page: Page,
  vetraBlocksJson: string,
): Promise<ClipboardEventSnapshot> {
  return dispatchEditorClipboardEvent(page, 'paste', {
    [VETRA_BLOCK_CLIPBOARD_MIME_TYPE]: vetraBlocksJson,
    'text/plain': 'Plain text fallback should not be used when Vetra blocks are present.',
  })
}

async function dispatchEditorClipboardEvent(
  page: Page,
  type: 'copy' | 'paste',
  data: Readonly<Record<string, string>>,
): Promise<ClipboardEventSnapshot> {
  return editorRoot(page).evaluate(
    (node, payload) => {
      const clipboardData = new DataTransfer()

      for (const [format, value] of Object.entries(payload.data)) {
        clipboardData.setData(format, value)
      }

      const dispatched = node.dispatchEvent(
        new ClipboardEvent(payload.type, {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }),
      )

      return {
        defaultPrevented: !dispatched,
        plainText: clipboardData.getData('text/plain'),
        vetraBlocksJson: clipboardData.getData(payload.mimeType),
      }
    },
    { data, mimeType: VETRA_BLOCK_CLIPBOARD_MIME_TYPE, type },
  )
}

async function dispatchEditorKeydown(
  page: Page,
  key: string,
  options: { readonly ctrlKey?: boolean; readonly metaKey?: boolean; readonly shiftKey?: boolean },
): Promise<void> {
  await editorRoot(page).evaluate(
    (node, payload) => {
      node.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ctrlKey: payload.ctrlKey ?? false,
          key: payload.key,
          metaKey: payload.metaKey ?? false,
          shiftKey: payload.shiftKey ?? false,
        }),
      )
    },
    { key, ...options },
  )
}

async function readLocatorTop(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()

  if (box === null) {
    throw new Error('Expected locator to have a bounding box.')
  }

  return box.y
}

interface LocatorBox {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}

async function readLocatorBox(locator: Locator): Promise<LocatorBox> {
  const box = await locator.boundingBox()

  if (box === null) {
    throw new Error('Expected locator to have a bounding box.')
  }

  return box
}

async function readInlineStyleTransform(locator: Locator): Promise<string> {
  return locator.evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error('Expected locator to resolve to an HTMLElement.')
    }

    return node.style.transform
  })
}

async function readInspectorDocumentVersion(page: Page): Promise<number> {
  return readNumberAttribute(page.locator('[data-vetra-inspector-document-version]'), {
    attribute: 'data-vetra-inspector-document-version',
    label: 'inspector document version',
  })
}

async function readInspectorActivityCount(page: Page): Promise<number> {
  return readNumberAttribute(page.locator('[data-vetra-inspector-activity-count]'), {
    attribute: 'data-vetra-inspector-activity-count',
    label: 'inspector activity count',
  })
}

async function readNumberAttribute(
  locator: Locator,
  options: { readonly attribute: string; readonly label: string },
): Promise<number> {
  const rawValue = await locator.getAttribute(options.attribute)

  if (rawValue === null) {
    throw new Error(`Expected ${options.label} attribute to be present.`)
  }

  const parsedValue = Number.parseInt(rawValue, 10)

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Expected ${options.label} attribute to be numeric.`)
  }

  return parsedValue
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
