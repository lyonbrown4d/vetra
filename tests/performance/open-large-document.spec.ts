import { expect, test } from '@playwright/test'

test('records initial demo render timing', async ({ page }) => {
  const start = Date.now()
  await page.goto('/')
  await expect(page.getByLabel('Vetra editor demo')).toBeVisible()
  const durationMs = Date.now() - start

  test.info().annotations.push({
    type: 'metric',
    description: `initial-render-ms=${String(durationMs)}`,
  })
})
