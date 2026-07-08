import { expect, test } from '@playwright/test'

async function mockAuthedApi(page, { tabs = [], links = [] } = {}) {
  await page.route('**/api/auth/register', async (route) => {
    await route.fulfill({ json: { id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' } })
  })
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({ json: { access_token: 'test-token', token_type: 'bearer' } })
  })
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' } })
  })
  await page.route('**/api/tabs', async (route) => {
    await route.fulfill({ json: tabs })
  })
  await page.route('**/api/links/trash', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 99,
          title: 'Deleted resource',
          url: 'https://deleted.example.com',
          tags: [],
          is_favorite: false,
          is_pinned: false,
          is_read: false,
          priority: 'normal',
          sort_order: 0,
          created_at: '2026-07-07T00:00:00Z',
          updated_at: '2026-07-07T00:00:00Z',
          deleted_at: '2026-07-08T00:00:00Z',
        },
      ],
    })
  })
  await page.route('**/api/links/*/restore', async (route) => {
    await route.fulfill({ json: { id: 99, title: 'Deleted resource', url: 'https://deleted.example.com', deleted_at: null } })
  })
  await page.route('**/api/links/*/destroy', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/api/links/*/attachments/**', async (route) => {
    await route.fulfill({ json: { id: 1, filename: 'note.txt', data_url: 'data:text/plain;base64,SGVsbG8=' } })
  })
  await page.route('**/api/links/*', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({
        json: {
          link: links[0] || {
            id: 1,
            title: 'Detail link',
            url: 'https://detail.example.com',
            tags: [],
            is_favorite: false,
            is_pinned: false,
            is_read: false,
            priority: 'normal',
            sort_order: 0,
            created_at: '2026-07-07T00:00:00Z',
            updated_at: '2026-07-07T00:00:00Z',
          },
          history: [{ id: 1, action: 'created', changes: {}, created_at: '2026-07-07T00:00:00Z' }],
          archives: [],
          highlights: [],
          attachments: [],
        },
      })
      return
    }
    await route.fulfill({ json: links[0] || {} })
  })
  await page.route('**/api/links**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/api/links/trash')) {
      await route.fulfill({
        json: [
          {
            id: 99,
            title: 'Deleted resource',
            url: 'https://deleted.example.com',
            tags: [],
            is_favorite: false,
            is_pinned: false,
            is_read: false,
            priority: 'normal',
            sort_order: 0,
            created_at: '2026-07-07T00:00:00Z',
            updated_at: '2026-07-07T00:00:00Z',
            deleted_at: '2026-07-08T00:00:00Z',
          },
        ],
      })
      return
    }
    if (url.includes('/restore')) {
      await route.fulfill({ json: { id: 99, title: 'Deleted resource', url: 'https://deleted.example.com', deleted_at: null } })
      return
    }
    if (url.includes('/destroy')) {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (method === 'GET' && /\/api\/links\/\d+$/.test(new URL(url).pathname)) {
      await route.fulfill({
        json: {
          link: links[0] || {
            id: 1,
            title: 'Detail link',
            url: 'https://detail.example.com',
            tags: [],
            is_favorite: false,
            is_pinned: false,
            is_read: false,
            priority: 'normal',
            sort_order: 0,
            created_at: '2026-07-07T00:00:00Z',
            updated_at: '2026-07-07T00:00:00Z',
          },
          history: [{ id: 1, action: 'created', changes: {}, created_at: '2026-07-07T00:00:00Z' }],
          archives: [],
          highlights: [],
          attachments: [],
        },
      })
      return
    }
    await route.fulfill({ json: links })
  })
  await page.route('**/api/links/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/api/links/trash')) {
      await route.fulfill({
        json: [
          {
            id: 99,
            title: 'Deleted resource',
            url: 'https://deleted.example.com',
            tags: [],
            is_favorite: false,
            is_pinned: false,
            is_read: false,
            priority: 'normal',
            sort_order: 0,
            created_at: '2026-07-07T00:00:00Z',
            updated_at: '2026-07-07T00:00:00Z',
            deleted_at: '2026-07-08T00:00:00Z',
          },
        ],
      })
      return
    }
    if (url.includes('/restore')) {
      await route.fulfill({ json: { id: 99, title: 'Deleted resource', url: 'https://deleted.example.com', deleted_at: null } })
      return
    }
    if (url.includes('/destroy')) {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (url.includes('/archive')) {
      await route.fulfill({ status: 201, json: { id: 1, status: 'succeeded' } })
      return
    }
    if (method === 'GET') {
      await route.fulfill({
        json: {
          link: links[0] || {
            id: 1,
            title: 'Detail link',
            url: 'https://detail.example.com',
            tags: [],
            is_favorite: false,
            is_pinned: false,
            is_read: false,
            priority: 'normal',
            sort_order: 0,
            created_at: '2026-07-07T00:00:00Z',
            updated_at: '2026-07-07T00:00:00Z',
          },
          history: [{ id: 1, action: 'created', changes: {}, created_at: '2026-07-07T00:00:00Z' }],
          archives: [],
          highlights: [],
          attachments: [],
        },
      })
      return
    }
    await route.fulfill({ json: links[0] || {} })
  })
  await page.route('**/api/links/**/restore', async (route) => {
    await route.fulfill({ json: { id: 99, title: 'Deleted resource', url: 'https://deleted.example.com', deleted_at: null } })
  })
  await page.route('**/api/links/bulk', async (route) => {
    await route.fulfill({ json: { affected: 1, action: 'restore' } })
  })
  await page.route('**/api/stats', async (route) => {
    await route.fulfill({ json: { total_links: 0, total_tabs: 0, total_favorites: 0, total_pinned: 0, recent_links: [] } })
  })
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ json: { status: 'ok', version: '2.7.0', bot: false } })
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
  await page.route('**/api/settings/snapshots/*/preview**', async (route) => {
    await route.fulfill({ json: { mode: 'replace', links_new: 1, links_existing: 0, links_invalid: 0, tabs_new: 0, tabs_existing: 0, replace_deletes_links: 2, replace_deletes_tabs: 1, sample_links: [] } })
  })
  await page.route('**/api/settings/api-tokens', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        json: {
          id: 2,
          name: 'Playwright token',
          token: 'lkat_test_token',
          token_prefix: 'lkat_test_to',
          scopes: ['links:read', 'links:write'],
          created_at: '2026-07-08T00:00:00Z',
          last_used_at: null,
          revoked_at: null,
        },
      })
      return
    }
    await route.fulfill({ json: [{ id: 1, name: 'Existing token', token_prefix: 'lkat_existing', scopes: [], created_at: '2026-07-07T00:00:00Z', last_used_at: null, revoked_at: null }] })
  })
  await page.route('**/api/settings/notifications', async (route) => {
    await route.fulfill({ json: [{ id: 1, type: 'bulk', title: 'Bulk action complete', body: '2 links processed', payload: {}, read_at: null, created_at: '2026-07-08T00:00:00Z' }] })
  })
  await page.route('**/api/settings/import/preview**', async (route) => {
    await route.fulfill({ json: { mode: 'merge', links_new: 1, links_existing: 1, links_invalid: 0, tabs_new: 0, tabs_existing: 0, replace_deletes_links: 0, replace_deletes_tabs: 0, sample_links: [] } })
  })
  await page.route('**/api/settings/import-file/preview**', async (route) => {
    await route.fulfill({ json: { mode: 'merge', links_new: 1, links_existing: 1, links_invalid: 0, tabs_new: 0, tabs_existing: 0, replace_deletes_links: 0, replace_deletes_tabs: 0, sample_links: [] } })
  })
  await page.route('**/api/jobs', async (route) => {
    await route.fulfill({ json: { jobs: [{ id: 1, type: 'backup_snapshot', status: 'succeeded', created_at: '2026-07-07T00:00:00Z' }] } })
  })
  await page.route('**/api/admin/overview', async (route) => {
    await route.fulfill({ status: 403, json: { detail: 'Admin access required' } })
  })
  await page.route('**/api/admin/health', async (route) => {
    await route.fulfill({ status: 403, json: { detail: 'Admin access required' } })
  })
}

test('registers and opens the library', async ({ page }) => {
  await mockAuthedApi(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'LinkAtlas' })).toBeVisible()
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
  await page.locator('input[type="file"]').setInputFiles({
    name: 'links.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ links: [{ title: 'Imported', url: 'https://imported.example.com' }] })),
  })
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByText('New links')).toBeVisible()
  await expect(page.getByText('Existing', { exact: true })).toBeVisible()
  await expect(page.getByText('Daily')).toBeVisible()
  await expect(page.getByText('docs')).toBeVisible()
})

test('shows API tokens and notifications in settings', async ({ page }) => {
  await mockAuthedApi(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('lk_token', 'test-token')
    window.localStorage.setItem('lk_user', JSON.stringify({ id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' }))
  })

  await page.goto('/settings')

  await expect(page.getByText('Personal API access')).toBeVisible()
  await expect(page.getByText('Existing token')).toBeVisible()
  await expect(page.getByText('Bulk action complete')).toBeVisible()
  const tokenSection = page.locator('section').filter({ hasText: 'Personal API access' })
  await tokenSection.getByPlaceholder('Token name').fill('Playwright token')
  await tokenSection.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('lkat_test_token')).toBeVisible()
})

test('selects a trashed link for restore', async ({ page }) => {
  await mockAuthedApi(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('lk_token', 'test-token')
    window.localStorage.setItem('lk_user', JSON.stringify({ id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' }))
  })

  await page.goto('/trash')

  await expect(page).toHaveURL(/\/trash$/)
  await expect(page.getByText('Deleted resource')).toBeVisible()
  await page.getByLabel('Select link').click()
  await expect(page.getByText('1 selected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore selected links' })).toBeVisible()
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

test('sets folder PIN with four digit inputs', async ({ page }) => {
  await mockAuthedApi(page, {
    tabs: [
      {
        id: 42,
        name: 'Design System',
        color: '#7c8cff',
        parent_id: null,
        link_count: 0,
        total_link_count: 0,
        child_count: 0,
        is_locked: false,
        is_unlocked: false,
      },
    ],
  })
  await page.route('**/api/tabs/42/lock', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(JSON.parse(route.request().postData())).toEqual({ password: '1234' })
    await route.fulfill({ json: { status: 'ok' } })
  })
  await page.addInitScript(() => {
    window.localStorage.setItem('lk_token', 'test-token')
    window.localStorage.setItem('lk_user', JSON.stringify({ id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' }))
  })

  await page.goto('/')

  await page.getByRole('button', { name: 'Open actions for Design System', exact: true }).click()
  await page.getByRole('button', { name: 'Set PIN' }).click()
  await expect(page.getByRole('heading', { name: 'Protect folder' })).toBeVisible()
  await expect(page.getByRole('group', { name: '4-digit folder PIN' }).locator('input')).toHaveCount(4)

  await page.getByLabel('PIN digit 1').fill('1')
  await page.getByLabel('PIN digit 2').fill('2')
  await page.getByLabel('PIN digit 3').fill('3')
  await page.getByLabel('PIN digit 4').fill('4')
  await page.getByRole('button', { name: 'Set PIN' }).click()

  await expect(page.getByRole('heading', { name: 'Protect folder' })).toHaveCount(0)
})

test('locks an unlocked protected folder from the folder card menu', async ({ page }) => {
  await mockAuthedApi(page, {
    tabs: [
      {
        id: 42,
        name: 'Design System',
        color: '#7c8cff',
        parent_id: null,
        link_count: 3,
        total_link_count: 3,
        child_count: 0,
        is_locked: true,
        is_unlocked: true,
      },
    ],
  })
  await page.addInitScript(() => {
    window.localStorage.setItem('lk_token', 'test-token')
    window.localStorage.setItem('lk_user', JSON.stringify({ id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' }))
    window.sessionStorage.setItem('lk_folder_unlocks', JSON.stringify({
      42: { token: 'unlock-token', expires_at: '2099-01-01T00:00:00Z' },
    }))
  })

  await page.goto('/')

  await page.getByRole('button', { name: 'Open actions for Design System', exact: true }).click()
  await page.getByRole('button', { name: 'Lock folder' }).click()

  const unlocks = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('lk_folder_unlocks') || '{}'))
  expect(unlocks['42']).toBeUndefined()
  await expect(page.getByText('Folder locked')).toBeVisible()
})

test('selects a dashboard link in the inspector panel', async ({ page }) => {
  await mockAuthedApi(page, {
    tabs: [
      { id: 7, name: 'Research', color: '#7c8cff', parent_id: null, link_count: 2, total_link_count: 2, child_count: 0 },
    ],
    links: [
      {
        id: 1,
        title: 'First capture',
        url: 'https://first.example.com',
        tab_id: 7,
        tags: ['alpha'],
        created_at: '2026-07-07T00:00:00Z',
        archive_status: 'completed',
        http_status: 200,
      },
      {
        id: 2,
        title: 'Second capture',
        url: 'https://second.example.com',
        tab_id: 7,
        tags: ['beta'],
        created_at: '2026-07-08T00:00:00Z',
        archive_status: 'pending',
        http_status: 200,
      },
    ],
  })
  await page.addInitScript(() => {
    window.localStorage.setItem('lk_token', 'test-token')
    window.localStorage.setItem('lk_user', JSON.stringify({ id: 1, username: 'demo', created_at: '2026-07-07T00:00:00Z' }))
  })

  await page.goto('/')

  const inspector = page.locator('.inspector-panel')
  await expect(inspector.getByText('First capture')).toBeVisible()
  await page.getByRole('button', { name: 'Inspect Second capture' }).click()
  await expect(inspector.getByText('Second capture')).toBeVisible()
  await expect(inspector.getByText('Archiving')).toBeVisible()
})
