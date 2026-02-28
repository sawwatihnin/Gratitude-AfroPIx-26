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
