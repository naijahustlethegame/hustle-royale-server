# Hustle Royale server

Authoritative game server: combat simulation, matchmaking, progression and marketplace.
The browser never decides an outcome; it only sends intents and renders events.

## Run locally

```bash
pnpm install
cp .env.example .env     # then fill in SUPABASE_SERVICE_ROLE_KEY (Supabase -> Settings -> API)
pnpm dev                 # http://localhost:4000/health
pnpm test:run
```

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. Keep it in `.env` only (it is git-ignored), never in the web repo.

## Layout

```
src/
  index.ts, app.ts        bootstrap (Fastify, helmet, cors, rate limit)
  config/env.ts           validated environment
  plugins/                supabase (service role), auth (JWT verification), socket (Socket.IO + auth)
  engine/                 pure combat simulation: no network, no database, fully unit-tested
  modules/                (next) starter-pack, fighters, progression, training, marketplace, economy, battle
```

## Combat engine

`engine/` is a deterministic, real-time simulation. Call `step(state, dtMs)` on a fixed tick (about 100 ms) and broadcast the returned events.

- Every skill has a cooldown; speed shortens it: `cooldown = base * 50 / (50 + spd)`.
- Fighters use stamina-based energy for special skills. AI picks skills and targets (healers keep a heal reserve, tanks draw aggro).
- A participating player controls one fighter: `submitIntent(state, unitId, { type: "cast" | "focus", ... })`. The engine validates ownership, cooldown and energy. A controlled fighter auto-uses only its basic attack.
- Same seed, same battle, so a stored seed plus intents can replay or audit a match.
- Balance knobs live in `engine/stats.ts`.

## Database

Schema, RLS and the starter catalog live in the Supabase project and are applied as migrations. Players have read-only access to their own data; every write goes through this server.
To generate types: `pnpm gen:types` (needs the Supabase CLI).
