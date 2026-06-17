---
name: Vercel deployment config
description: How the BD Education Results project deploys frontend + Express API to Vercel
---

## Setup
- `vercel.json` at root with explicit `builds` (v2 format)
- Frontend: `@vercel/static-build` pointing at `frontend/package.json`, distDir = `dist`
- API: `@vercel/node` pointing at `api/src/app.ts` (which exports Express `app` as default)
- Routes: `/api/(.*)` → `api/src/app.ts`, then filesystem, then `/*` → `/index.html`

## Why explicit builds
Vercel auto-discovers `api/` as serverless functions when no `builds` key is set. Explicit builds prevent this conflict while keeping `api/` as the Express package.

## How to apply
- `api/src/app.ts` must export Express app as default (no listen call)
- `api/src/index.ts` handles listen for local dev; Vercel never calls it
- PORT defaults to 8080 in index.ts for `pnpm dev:api`
- Vite dev server proxies `/api` → `http://localhost:8080` in development
