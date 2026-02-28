# Gratitude

Gratitude is a Vite + React + Express app for discovering nearby:
- Events
- Volunteer opportunities
- Food banks and donation resources
- Community organizations/services
- Help & Support resources (clinics, legal aid, shelters, translators/interpreters, newcomer guides)
- Nearby user connections (simulated local networking)

## Application Summary

Gratitude helps users find local opportunities and support services in one place, with map/list/split browsing and strong source transparency.  
It prioritizes local/cached data first, then API/scraper sources, and uses AI as a cleanup/classification layer (not as the only data source).

Core product goals:
- Discover relevant nearby listings quickly
- Keep source links and timestamps for trust
- Reduce duplicates and irrelevant items
- Support language and cultural discovery
- Keep performance fast with local caching

## How To Use The App

1. Open the app and allow location access (or search by city/ZIP context in queries).
2. Choose a left sidebar section:
   - `Events`, `Volunteer Opportunities`, `Food Banks & Donations`, `Organizations`
   - `Help & Support` (clinics, legal aid, shelters, translators, newcomer guides)
   - `Connections`, `Saved Items`, `Map`
3. Use filters shown for the active section (tab-specific).
4. Switch view mode:
   - `List` for cards
   - `Map` for markers
   - `Split` for map + list together
5. Save useful items and revisit without re-running every query (local cache + DB cache).

### Help & Support Tab

Inside `Help & Support`, use sub-sections:
- Clinics
- Legal Aid
- Shelters
- Translators
- Newcomer Guides

Translator filters include language, service type, mode, specialization, cost, and availability.  
Newcomer guide filters include language, topic, and content format.

Local-first behavior:
1. Load from local DB/cache
2. Expand with fallback sources only when local data is missing/insufficient
3. Normalize/store results locally for faster next use

## Prerequisites

1. Node.js `22.12+` (recommended) or `20.19+`
2. npm `10+`

## Quick Start (macOS + Windows)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env`:
   - macOS/Linux:
     ```bash
     cp .env.example .env
     ```
   - Windows (PowerShell):
     ```powershell
     Copy-Item .env.example .env
     ```
3. Start development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Set these in `.env`:
- `GEMINI_API_KEY` (optional but recommended)
- `OPENAI_API_KEY` (optional AI failover)
- `SCRAPER_SOURCES` (recommended deterministic feeds)
- `SCRAPER_TIMEOUT_MS` (optional, default `10000`)
- `SCRAPER_RADIUS_MILES` (optional, default `25`)
- `TICKETMASTER_API_KEY` (optional API source)
- `EVENTBRITE_API_TOKEN` (optional API source)
- `YOUTUBE_API_KEY` (optional, enables in-app YouTube search + embed links)
- `BACKBOARD_API_KEY` (optional AI/data failover)
- `BACKBOARD_API_URL` (optional, default `https://api.backboard.io`)
- `PORT` (optional, default `3000`)

Example:
```env
SCRAPER_SOURCES="UNC Calendar|https://calendar.unc.edu/calendar.ics,Duke Calendar|https://calendar.duke.edu/events.ics,City Events|https://your-city.gov/events.rss"
SCRAPER_TIMEOUT_MS=10000
SCRAPER_RADIUS_MILES=25
TICKETMASTER_API_KEY=your_ticketmaster_key
EVENTBRITE_API_TOKEN=your_eventbrite_token
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
BACKBOARD_API_KEY=your_backboard_key
BACKBOARD_API_URL=https://api.backboard.io
```

## Data Pipeline and Fallback Order

Request flow:
1. Gemini
2. Backboard failover
3. OpenAI failover
4. Deterministic scraper fallback (`/api/scrape-fallback`)

Scraper fallback behavior:
- Parses RSS/Atom/ICS feeds.
- Uses rule-based categorization (`type`, `audience`) when AI is unavailable.
- Keeps `source_url` provenance.
- Deduplicates events by canonical URL or title+venue+day signature.
- Returns usable results even when no AI key is configured.

## Local Caching and Saved Data

- Search results are cached in browser `localStorage` (`gratitude_tab_cache_v1`) by tab.
- Video queries are cached in browser `localStorage` (`gratitude_video_cache_v1`) by query + filters.
- Local artist queries are cached in browser `localStorage` (`gratitude_artist_cache_v1`) by query + radius + location.
- Saved items are stored in browser `localStorage` (`communitree_list`).
- Server cache is stored in SQLite (`community.db`) via `/api/items`.
- Duplicate entries are removed before client render and before server cache insert.
- When a section returns no results, the app automatically runs AI/web failover (Backboard/Gemini path), then stores those results for reuse on next visit.

## Run Modes

Development:
```bash
npm run dev
```

Production-style local:
```bash
npm run build
npm run start
```

Optional checks:
```bash
npm run lint
npm run build
```

Health endpoint:
- [http://localhost:3000/api/health](http://localhost:3000/api/health)

## Troubleshooting

Blank page / render error:
1. Open browser console and copy first error line.
2. Run:
   ```bash
   npm run lint
   npm run build
   ```
3. Restart dev server after fixes.

Port in use (`EADDRINUSE`):
- macOS/Linux:
  ```bash
  lsof -ti tcp:3000 | xargs kill -9
  lsof -ti tcp:24678 | xargs kill -9
  ```
- Windows (PowerShell):
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  Get-NetTCPConnection -LocalPort 24678 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```

`PayloadTooLargeError`:
- Ensure you are on latest code (server JSON body limit increased and cache writes reduced).
- Restart server after pulling latest changes.

No scraper results:
1. Ensure `SCRAPER_SOURCES` is populated with valid public RSS/Atom/ICS URLs.
2. Prefer official city/university/nonprofit feeds.
3. Increase feed count for better coverage.

## Recommended Upgrades

1. Add server-side pagination for `/api/items/:tab` for faster first paint on large datasets.
2. Add scheduled background scraper refresh jobs and stale cache invalidation by source.
3. Add map marker clustering and lazy marker rendering for large result sets.
4. Add WebSocket-based real-time updates for the Connections messaging panel.
5. Add automated feed health checks (last successful scrape, parse failure rate).
6. Expand public API ingestion (YouTube, OpenStreetMap/Overpass, city open data) with per-source monitoring.

## Scripts

- `npm run dev` - start Express + Vite middleware development server
- `npm run build` - build frontend assets into `dist/`
- `npm run start` - run server in production mode
- `npm run lint` - TypeScript type-check (`tsc --noEmit`)
- `npm run preview` - preview Vite build output
