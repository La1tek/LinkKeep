import { expect, test } from '@playwright/test'

async function mockAuthedApi(page) {
  await page.route('**/api/auth/register', async (route) => {
    await route.fulfill({ json: { id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' } })
  })
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({ json: { access_token: 'test-token', token_type: 'bearer' } })
  })
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' } })
  })
  await page.route('**/api/tabs**', async (route) => {
    await route.fulfill({ json: [] })
  })
  await page.route('**/api/links**', async (route) => {
    await route.fulfill({ json: [] })
  })
  await page.route('**/api/stats', async (route) => {
    await route.fulfill({ json: { total_links: 0, total_tabs: 0, total_favorites: 0, total_pinned: 0, recent_links: [] } })
  })
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ json: { status: 'ok', version: '2.4.0', bot: false } })
  })
  await page.route('**/api/auth/sessions', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 1,
          user_agent: 'Playwright',
          ip_address: '127.0.0.1',
          created_at: '2026-07-07T00:00:00Z',
          expires_at: '2026-08-07T00:00:00Z',
          revoked_at: null,
          current: true,
        },
      ],
    })
  })
  await page.route('**/api/tags', async (route) => {
    await route.fulfill({ json: { tags: [{ name: 'docs', count: 2 }] } })
  })
}

test('registers and opens the library', async ({ page }) => {
  await mockAuthedApi(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'LinkKeep' })).toBeVisible()
  await page.getByRole('button', { name: /register/i }).click()
  await page.getByPlaceholder('your_username').fill('demo')
  await page.getByPlaceholder('••••••••').fill('secret123')
  await page.getByRole('button', { name: /create account/i }).click()

  await expect(page.getByRole('heading', { name: 'My Library' })).toBeVisible()
  await expect(page.getByText('0 links across 0 folders')).toBeVisible()
})

test('shows sessions, import mode and tag management in settings', async ({ page }) => {
  await mockAuthedApi(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('lk_token', 'test-token')
    window.localStorage.setItem('lk_user', JSON.stringify({ id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' }))
  })

  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Playwright')).toBeVisible()
  await expect(page.getByText('Import Mode')).toBeVisible()
  await expect(page.getByText('docs')).toBeVisible()
})
