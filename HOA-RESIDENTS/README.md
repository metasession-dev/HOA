# HOA-RESIDENTS

Resident-facing PWA for HOA.africa. Calls into [HOA-API](../HOA-API).

## Local development

```bash
npm install
npm run dev
```

Listens on `http://localhost:3001`. Set `NEXT_PUBLIC_API_URL` in `.env` to point at the API (defaults to `http://localhost:3003`).

## PWA

`next-pwa` is wired up in `next.config.js`. Service worker is disabled in development so HMR works; enabled automatically in production builds. Manifest lives at `public/manifest.webmanifest`. Placeholder icons in `public/icons/` — replace with branded artwork before launch.

## Shared types

`src/shared/` is a duplicated copy of the equivalent in HOA-API and HOA-ENTERPRISE. Keep in sync manually when types change. If drift becomes painful, revisit packaging as a private npm package.

## Out of scope (per PRD)

- Backend for `/requests` (PRD §6.3.2 — UI-only stub today)
- Gate pass / visitor management (PRD §6.4)
- Real PWA icons, push notifications, install banner
