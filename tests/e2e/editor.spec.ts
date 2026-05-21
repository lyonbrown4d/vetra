import { expect, test } from '@playwright/test'

test('opens the Vetra demo editor', async ({ page }) => {
  await page.goto('/')

  const sidebar = page.getByRole('complementary')
  const editor = page.getByLabel('Vetra editor demo')

  await expect(sidebar.getByRole('heading', { name: 'Vetra' })).toBeVisible()
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Virtualized paragraph 100' })).not.toBeVisible()
})
