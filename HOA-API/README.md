# HOA-API

NestJS backend for the HOA.africa platform. Serves both the admin web app ([HOA-ENTERPRISE](../HOA-ENTERPRISE)) and the resident PWA ([HOA-RESIDENTS](../HOA-RESIDENTS)).

## First-time setup

```bash
npm install
npm run infra:up        # starts Postgres (5435) + Redis (6385) in Docker
npm run db:generate
npm run db:migrate
npm run dev             # starts API on port 3003
```

## Day-to-day

```bash
npm run infra:up        # bring infra up — idempotent, safe to re-run
npm run dev             # API on http://localhost:3003
```

Infra control:

| Command | What it does |
|---|---|
| `npm run infra:up` | Start Postgres + Redis in detached mode |
| `npm run infra:down` | Stop both (data persists in named volumes) |
| `npm run infra:status` | Show container health |
| `npm run infra:logs` | Tail Postgres + Redis logs |

If you see `PrismaClientInitializationError: Can't reach database server at localhost:5435`, your Postgres container is stopped — `npm run infra:up` fixes it.

API listens on `http://localhost:3003`. Swagger docs at `http://localhost:3003/api/docs`. Health at `http://localhost:3003/api/health`.

## Architecture

- **NestJS 10** modules under `src/`
- **Prisma 5** schema at `prisma/schema.prisma`, migrations under `prisma/migrations/`
- **Shared types** at `shared/` (installed as `@hoa/shared` via `file:./shared`). Duplicated across `HOA-ENTERPRISE` and `HOA-RESIDENTS` — keep in sync manually when types change.
- **RBAC**: global `JwtAuthGuard` + `RolesGuard` (see `src/auth/guards/`). Endpoints opt-in to RBAC via `@Roles(...)` from `src/common/decorators`. Public endpoints use `@Public()`.
- **CORS**: `CORS_ORIGIN` is a comma-separated list (e.g. `http://localhost:3000,http://localhost:3001`).

## Env vars

See `.env.example`.
