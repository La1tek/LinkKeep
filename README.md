# LinkKeep v2.4

Self-hosted link manager with folders, tags, favorites, search, browser extension, and optional Telegram link intake.

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

## Development

Backend:

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

Frontend:

```bash
cd frontend
npm install
npm run build
```
