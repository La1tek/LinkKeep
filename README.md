# LinkKeep v2.8

Self-hosted link manager with folders, tags, favorites, full-text search, full-page archiving, AI-assisted knowledge workflows, public shared collections, backups, trash recovery, detail history, API tokens, browser extension overlay, PWA support, and optional Telegram link intake.

## Stack

- Frontend: React, Vite, Tailwind CSS, Framer Motion
- Backend: FastAPI, SQLAlchemy, SQLite
- Infra: Docker Compose, Nginx

## Quick Start

Create a strong JWT secret before starting the stack:

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
docker compose up -d --build
```

Open `http://localhost:9091`.

If you deploy behind another origin, set `CORS_ORIGINS` to the public app URL:

```bash
export CORS_ORIGINS="https://links.example.com"
```

## Browser Extension

For local unpacked install, load the `extension/` directory in `chrome://extensions`.

The server build also publishes a downloadable zip at `/LinkKeep-extension.zip`.

## Product Features

- Public shared collections at `/share/{token}`
- Full-text search index with manual rebuild and background job support
- Backup snapshots with restore modes and retention
- Soft-delete trash with restore/permanent-delete flows
- Link detail panel with notes, reminders, priority, attachments, highlights, archive timeline, and change history
- Revocable API tokens for extension and automation access
- Import/restore previews before mutating stored links
- Automation rules for site/url/tag routing, default Inbox, auto-archive jobs, and dead-link review
- Workflow Hub with smart collections, reader mode, highlights export, semantic search, health history, workspaces, webhooks, and public profile controls
- Real archive engine with Playwright screenshots/PDFs when available, disk/S3 storage manifest, retry policy, and archive diffs
- AI assistant over saved links, local semantic embeddings, related links, knowledge graph, digest/review queues, reminders, and command palette
- Browser extension overlay with saved/unsaved status, inline highlights, reader drawer, and quick folder/tag updates
- Imports from LinkKeep JSON, browser bookmarks HTML, Pocket JSON, and Raindrop CSV
- Recommendations for autotags, stale links, and dead links
- Admin overview when `ADMIN_USERNAMES` contains the current username
- PWA install/offline shell caching

## Development

Backend:

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
alembic upgrade head
pytest
```

Useful root commands:

```bash
make migrate
make check
make package-extension
make release
```

Frontend:

```bash
cd frontend
npm install
npm run build
```
