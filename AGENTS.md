# AGENTS.md

Self-hosted (Mac mini, Ubuntu) grade-management app served under `https://hahyn.com/p/sahak/`.

## Stack
- TanStack Start + React 19 + Vite 7 + Tailwind 4; base path `/p/sahak` (set in `vite.config.ts`, `src/router.tsx`, and `BASE_PATH` in `server.mjs` — keep all in sync)
- Postgres via Drizzle ORM (`db/index.ts`, `DATABASE_URL`)
- Auth: own Google OAuth (PKCE) in `src/server/oauth.server.ts`; DB sessions in `src/server/session.server.ts`; only `@sasa.hs.kr`; admin = `eyirania@sasa.hs.kr` (`src/lib/auth.ts`)
- Production server: `server.mjs` (srvx) on 127.0.0.1:5000, behind Caddy → Cloudflare Tunnel

## Env
`DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_ORIGIN=https://hahyn.com`, `PORT` (default 5000). See `deploy/env.example`.

## Commands
`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm migrate`

## Rules
- Schema changes: edit `db/schema.ts`, then `pnpm drizzle-kit generate --name ...`. Never hand-edit applied migrations in `netlify/database/migrations/`.
- `students.identity_user_id` is the Google `sub`; legacy rows are linked by lowercase email at first login.
- Server-only code lives in `*.server.ts` and is imported dynamically from server functions.
- Never commit `.env` or DB dumps.
