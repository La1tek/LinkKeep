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
  await page.route('**/api/settings/snapshots', async (route) => {
    await route.fulfill({ json: { snapshots: [{ id: 1, name: 'Daily', created_at: '2026-07-07T00:00:00Z' }] } })
  })
  await page.route('**/api/jobs', async (route) => {
    await route.fulfill({ json: { jobs: [{ id: 1, type: 'backup_snapshot', status: 'succeeded', created_at: '2026-07-07T00:00:00Z' }] } })
  })
  await page.route('**/api/admin/overview', async (route) => {
    await route.fulfill({ status: 403, json: { detail: 'Admin access required' } })
  })
}

test('registers and opens the library', async ({ page }) => {
  await mockAuthedApi(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'LinkKeep' })).toBeVisible()
  await page.getByRole('button', { name: /register/i }).click()
  await page.getByLabel('Username').fill('demo')
  await page.getByLabel('Password').fill('secret123')
  await page.getByRole('button', { name: /create account/i }).click()

  await expect(page.getByRole('heading', { name: 'Observatory' })).toBeVisible()
  await expect(page.getByText('0 links in the vault')).toBeVisible()
  await expect(page.getByText('No links yet')).toBeVisible()
})

test('shows sessions, quick import and tag management in settings', async ({ page }) => {
  await mockAuthedApi(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('lk_token', 'test-token')
    window.localStorage.setItem('lk_user', JSON.stringify({ id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' }))
  })

  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Playwright')).toBeVisible()
  await expect(page.getByRole('button', { name: /quick import/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Admin$/ })).toHaveCount(0)
  await page.getByRole('button', { name: /quick import/i }).click()
  await expect(page.getByRole('heading', { name: 'Quick Import' })).toBeVisible()
  await expect(page.getByText('Mode', { exact: true })).toBeVisible()
  await expect(page.getByText('Daily')).toBeVisible()
  await expect(page.getByText('docs')).toBeVisible()
})

test('opens a public share without auth', async ({ page }) => {
  await page.route('**/api/public/shares/share-token', async (route) => {
    await route.fulfill({
      json: {
        title: 'Public collection',
        owner: 'demo',
        links: [{ id: 1, title: 'Shared link', url: 'https://shared.example.com', tags: [] }],
      },
    })
  })

  await page.goto('/share/share-token')
  await expect(page.getByRole('heading', { name: 'Public collection' })).toBeVisible()
  await expect(page.getByText('Shared link')).toBeVisible()
})
