# Allo Health — Inventory Reservations

Next.js app for multi-warehouse inventory with **race-safe checkout reservations**. When a shopper proceeds to checkout, units are held for 10 minutes. Payment confirmation permanently decrements stock; expiry or cancel releases the hold.

**Live demo:** add your Vercel URL after deploy.

## Stack

| Layer | Choice |
|--------|--------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Database | PostgreSQL (Supabase / Neon) via Prisma |
| Validation | Zod |
| UI | Tailwind CSS 4 + lightweight shadcn-style components |
| Hosting | Vercel + Vercel Cron |
| Optional | Upstash Redis (env placeholders for future lock/cache) |

## Run locally

### 1. Clone and install

```bash
git clone https://github.com/Pavan-TDAI/all0-health.git
cd allo-health
npm install
```

### 2. Environment variables

Copy the example file and fill in your hosted Postgres credentials:

```bash
cp .env.example .env.local
```

**Important:** Prisma CLI does not read `.env.local` by itself. Use the npm scripts (`npm run db:migrate`, `npm run db:seed`) which load `.env.local` automatically. Or duplicate the file: `copy .env.local .env` on Windows.

### Where to find Supabase connection strings

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. **Project Settings** (gear icon) → **Database**.
3. Under **Connection string**, choose **URI**:
   - **Transaction pooler** → port `6543` → paste as `DATABASE_URL` (add `?pgbouncer=true` at the end).
   - **Session pooler** → port `5432` on `aws-0-….pooler.supabase.com` → paste as `DIRECT_URL` (required on Windows / IPv4 networks).
   - **Direct connection** (`db.xxxxx.supabase.co`) is IPv6-only — if you see “Not IPv4 compatible” in Supabase, do **not** use it for `DIRECT_URL`; use Session pooler instead.
4. Replace `[YOUR-PASSWORD]` with your database password (URL-encode `@` as `%40`).

> **Note:** A Supabase access token (`sbp_…`) is for the Management API, not database connections. Prisma only needs `DATABASE_URL` and `DIRECT_URL`.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled Postgres URL (Supabase transaction pooler, port **6543**) |
| `DIRECT_URL` | Session pooler URL for migrations (port **5432**, same pooler host) |
| `CRON_SECRET` | Bearer token for `/api/cron/expire-reservations` |

### 3. Create tables

**If `npm run db:migrate` fails with P1001** (common on Windows when port 5432 is blocked):

1. Open **Supabase → SQL Editor → New query**
2. Paste and run the file `scripts/supabase-manual-setup.sql`
3. Then seed:

```bash
npm run db:seed
```

**If migrate works on your network:**

```bash
npm run db:migrate
npm run db:seed
```

### 4. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | Products with available stock per warehouse |
| GET | `/api/warehouses` | Warehouses with stock summary |
| POST | `/api/reservations` | Reserve units (`409` if insufficient stock) |
| POST | `/api/reservations/:id/confirm` | Confirm payment (`410` if expired) |
| POST | `/api/reservations/:id/release` | Cancel / release early |
| GET | `/api/reservations/:id` | Reservation detail (used by checkout UI) |

Send `Idempotency-Key` on **reserve** and **confirm** for safe retries.

## Concurrency design

Overselling is prevented with a **single atomic `UPDATE`** on `stock_levels`:

```sql
UPDATE stock_levels
SET "reservedUnits" = "reservedUnits" + :qty
WHERE "productId" = :pid AND "warehouseId" = :wid
  AND "totalUnits" - "reservedUnits" >= :qty;
```

If zero rows are updated, the API returns **409**. Two simultaneous requests for the last unit cannot both succeed — no application-level read-modify-write race.

Confirm and release use `SELECT … FOR UPDATE` on the reservation row inside a transaction, then adjust stock accordingly.

## Idempotency

`Idempotency-Key` + scope are stored in `idempotency_records` (Postgres). A retry returns the cached status/body without re-running side effects. If the same key is reused with a different payload hash, the API returns **422**.

Reservation rows also store `idempotencyKey` (unique) so duplicate reserve keys map to the same reservation.

## Reservation expiry (production)

**Primary:** Vercel Cron hits `/api/cron/expire-reservations` every minute (`vercel.json`). Protected with `Authorization: Bearer ${CRON_SECRET}`.

**Secondary (lazy cleanup):** Product listing, reservation reads, and new reserves call `expireStaleReservations()` so stock frees even between cron ticks.

## Deploy (Vercel)

1. Push the repo to GitHub and import the project in [Vercel](https://vercel.com).
2. Add env vars: `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET`.
3. Build command uses `prisma migrate deploy` via the `build` script.
4. After first deploy, run seed against production (locally with production `DATABASE_URL`, or a one-off script):

   ```bash
   npm run db:seed
   ```

5. In Vercel → Settings → Cron Jobs, confirm the job from `vercel.json` is active.

## Demo flow (for debrief)

1. Open the catalog — note **Limited Drop — Collagen** has **1** unit at Mumbai (concurrency demo).
2. Reserve from two browser windows — one gets checkout, the other **409**.
3. On checkout, watch the **10:00** countdown.
4. **Confirm purchase** → status Confirmed, stock permanently reduced.
5. Or **Cancel** → Released, stock available again.
6. Let the timer expire → **Confirm** shows **410**; cron releases within ~1 minute.

## Trade-offs & next steps

| Decision | Rationale |
|----------|-----------|
| Atomic SQL vs Redis lock | Postgres row update is simpler and sufficient for SKU-level contention; Redis reserved for multi-region scale-out. |
| Lazy + cron expiry | Cron gives predictable cleanup; lazy paths improve UX between ticks. |
| 10-minute TTL | Matches assignment; configurable via `RESERVATION_TTL_MS`. |
| Polling UI (5s / 2s) | No WebSockets on Vercel hobby; SWR/React Query would be next polish. |

With more time: Upstash distributed lock for cross-service calls, admin dashboard, reservation audit log, integration tests with parallel `fetch`, and OpenAPI docs.

## Project structure

```
prisma/          schema, migrations, seed
src/app/api/     REST routes + cron
src/lib/         inventory domain, idempotency, Prisma client
src/components/  catalog + checkout UI
```

## License

MIT — assignment submission for Allo.
