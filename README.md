# Communitree

Communitree is a Vite + React + Express app for discovering local community resources.

## Prerequisites

1. Node.js `22.12+` (recommended) or `20.19+`
2. npm `10+`

## Environment Setup

1. Copy the example env file:
   - macOS/Linux:
     ```bash
     cp .env.example .env
     ```
   - Windows (PowerShell):
     ```powershell
     Copy-Item .env.example .env
     ```
2. Open `.env` and set:
   - `GEMINI_API_KEY` (required for Gemini requests)
   - `OPENAI_API_KEY` (optional failover)
   - `SCRAPER_SOURCES` (recommended deterministic fallback feeds)
   - `SCRAPER_TIMEOUT_MS` (optional per-source timeout)

### Deterministic Scraper Fallback (AI-off mode)

When AI is unavailable, the app now falls back automatically to a deterministic web-scraper pipeline:
1. Gemini
2. OpenAI failover
3. `/api/scrape-fallback` (RSS/Atom/ICS sources, rule-based classification + dedupe)

Configure `SCRAPER_SOURCES` in `.env`:
```env
SCRAPER_SOURCES="City Calendar|https://your-city.gov/events.rss,University Calendar|https://calendar.yourschool.edu/events.ics"
SCRAPER_TIMEOUT_MS=10000
```

Notes:
- Add multiple high-quality official feeds for best coverage.
- Fallback scraper classifies type/audience with deterministic keyword rules.
- Source URL provenance is retained per listing.

## Run Locally (Cross-Platform)

All commands below work on both macOS and Windows.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start in development mode:
   ```bash
   npm run dev
   ```
3. Open:
   - [http://localhost:3000](http://localhost:3000)
4. Optional health check:
   - [http://localhost:3000/api/health](http://localhost:3000/api/health)

## Production-Style Local Run

1. Build:
   ```bash
   npm run build
   ```
2. Start server in production mode:
   ```bash
   npm run start
   ```
3. Open:
   - [http://localhost:3000](http://localhost:3000)

## Scripts

- `npm run dev`: Start app with dev server middleware.
- `npm run build`: Build frontend assets into `dist/`.
- `npm run start`: Run server in production mode (serves `dist/`).
- `npm run lint`: Type-check with TypeScript.
- `npm run preview`: Preview Vite build output.
# Gratitude-AfroPIx-26
