# LAST HOPE — STALKER RP DayZ Interactive Map (Hardened Edition)

Interactive map for the Last Hope DayZ RP server, with the **P0 security fixes applied** based on the technical audit report.

## What changed in this edition

This fork closes all three P0 vulnerabilities identified in the audit:

| Risk | Before | After |
|------|--------|-------|
| **R1** Hardcoded admin password `zone2026` in client bundle | Trivially extracted via DevTools | Server-side bcrypt hash in `AdminUser` table; verified via NextAuth Credentials provider |
| **R2** All mutating `/api/*` endpoints had zero auth | Anyone could `curl -X DELETE /api/markers` and wipe the DB | `requireAdmin()` guard on every mutating route + `middleware.ts` blocks navigation |
| **R3** Caddyfile `@transform_port_query` SSRF | External attacker could enumerate internal ports by varying `?XTransformPort=` | Handler removed entirely; Caddyfile is now a plain reverse proxy |
| **R5** XSS via `dangerouslySetInnerHTML` + unsanitized `color` | Custom category color could carry `<script>` payload | zod validation enforces `#RRGGBB` format on `color`, lowercase icon id |
| **R6** Map stored as data URL in localStorage (5–10 MB silent fail) | Quota exceeded → silent skip | (Roadmap item, deferred to P1 — see TODO.md) |
| **R8** Silent `.catch(() => {})` swallowed all errors | UI lied — said "saved" when server returned 500 | Replaced with toast notifications + optimistic rollback |

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

**Generate a NextAuth secret** (required to sign session JWTs):

```bash
openssl rand -base64 32
```

Paste the output into `NEXTAUTH_SECRET` in your `.env`.

### 3. Apply database schema

```bash
bun run db:generate   # generate Prisma client
bun run db:push       # create tables in SQLite
```

### 4. Create the admin user

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` in your `.env`, then:

```bash
bun run db:seed
```

The seed script bcrypt-hashes the password (cost factor 12) and stores it in the `AdminUser` table. The plaintext password is never persisted.

### 5. Run

```bash
bun run dev     # development, http://localhost:3000
bun run build   # production build
bun run start   # production server
```

## Architecture changes

### Authentication flow (new)

```
Browser → /admin
         ↓
    middleware.ts checks for NextAuth session JWT cookie
         ↓ (no session)
    redirect → /login?callbackUrl=/admin
         ↓ (valid session)
    app/admin/page.tsx (Server Component) → getServerSession() re-checks
         ↓ (passes)
    <AdminMapClient /> (client component, sets appMode='admin')
```

Defense in depth — three independent gates:
1. **Edge**: `middleware.ts` redirects unauthenticated requests to `/login`
2. **Server**: `app/admin/page.tsx` calls `getServerSession()` server-side before rendering
3. **Route handler**: every mutating `/api/*` route calls `requireAdmin()` which returns 401 if the session is missing or the user's role is not `admin`/`editor`

### API authorization

All mutating routes (POST/PATCH/DELETE) are protected by `requireAdmin()`:

```typescript
// src/app/api/markers/route.ts
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth; // 401 or 403 JSON response
  // ... safe to mutate the DB ...
}
```

Read routes (`GET /api/markers`, `GET /api/categories`) remain public — players need to see markers without logging in.

### Input validation

All API request bodies are validated via zod schemas in `src/lib/validation.ts`:

- `createMarkerSchema` — validates marker fields, trims strings, caps lengths
- `updateMarkerSchema` — partial updates with optional fields
- `createCategorySchema` — enforces `#RRGGBB` color format (closes XSS-via-color vector)

### Toast notifications

The Zustand store now has a `toasts: ToastMessage[]` slice with `pushToast(text, kind)` and `dismissToast(id)` actions. The `<ToastContainer />` component renders them in the bottom-right corner with auto-dismiss after 4s.

All store actions that previously did `.catch(() => {})` now:
1. Save the previous state for rollback
2. On error: restore the previous state and call `pushToast()` with the error message

### Server-side text sanitization

`src/lib/sanitize.ts` exports `escapeHtml()`, `sanitizeText()`, and `sanitizeForHtml()` — defense-in-depth for content that may be rendered via `dangerouslySetInnerHTML` on the client.

## New files

```
src/
  app/
    api/auth/[...nextauth]/route.ts   # NextAuth handler
    login/page.tsx                     # /login page (replaces client-side gate)
    admin/
      page.tsx                         # Server Component — auth check
      AdminMapClient.tsx               # Client wrapper for admin map
    providers.tsx                       # SessionProvider wrapper
  lib/
    auth.ts                             # authOptions + requireAdmin()
    validation.ts                      # zod schemas + validateBody()
    sanitize.ts                         # escapeHtml, sanitizeText
  middleware.ts                         # protects /admin/* and mutating /api/*
scripts/
  seed-admin.ts                         # bun run db:seed — creates first admin
.env.example                            # documents required env vars
```

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Prisma datasource — defaults to SQLite file |
| `NEXTAUTH_SECRET` | Yes | Signs session JWTs. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | Canonical deployment URL |
| `ADMIN_EMAIL` | Seed only | Admin login email |
| `ADMIN_PASSWORD` | Seed only | Plaintext password — bcrypt-hashed before storage |
| `ADMIN_NAME` | Optional | Admin display name |

## What's still on the roadmap (P1/P2)

This edition closes **all P0 items** and **most of P1**. Remaining work (see audit report §9):

- T9: Refactor `ZoneMapApp.tsx` (1201 lines) into sub-components
- T10: Move map image storage from localStorage to server
- T19/T20: Add unit + E2E tests
- T22: SSE/WebSocket for realtime marker sync between players
- T27: Self-host fonts via `next/font`

See `CHANGELOG.md` for the full list of changes in this edition.

## License

Original project author: corbinuwu (Telegram) / Sadbe (GitHub).
Hardened edition: Z.ai audit fix pack, July 2026.
