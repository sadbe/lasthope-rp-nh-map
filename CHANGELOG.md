# CHANGELOG — LAST HOPE Hardened Edition

All notable changes applied in this fork of the LAST HOPE Next.js app, based on the P0+P1 fixes from the technical audit report dated 2026-07-27.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — Hardened Edition

### 🔒 Security (P0)

#### R1 — Hardcoded admin password removed
- **Removed**: `ADMIN_PASSWORD = 'zone2026'` constant from `src/app/admin/page.tsx`
- **Removed**: client-side `AdminGate` component with `sessionStorage` flag
- **Added**: `AdminUser` Prisma model with `passwordHash` column (bcrypt)
- **Added**: `src/lib/auth.ts` with NextAuth Credentials provider config
- **Added**: `src/app/api/auth/[...nextauth]/route.ts` NextAuth catch-all handler
- **Added**: `src/app/login/page.tsx` server-rendered login form
- **Added**: `src/app/admin/page.tsx` rewritten as Server Component with `getServerSession()` check
- **Added**: `src/app/admin/AdminMapClient.tsx` client wrapper that renders the map after server-side auth passes
- **Added**: `src/app/providers.tsx` SessionProvider wrapper
- **Added**: `scripts/seed-admin.ts` — `bun run db:seed` creates the first admin user with bcrypt-hashed password
- **Added**: `bcryptjs` dependency

#### R2 — All mutating API endpoints now require admin auth
- **Modified**: `src/app/api/markers/route.ts` — POST, DELETE wrapped in `requireAdmin()`
- **Modified**: `src/app/api/markers/[id]/route.ts` — PATCH, DELETE wrapped in `requireAdmin()`
- **Modified**: `src/app/api/categories/route.ts` — POST wrapped in `requireAdmin()`
- **Modified**: `src/app/api/categories/[id]/route.ts` — DELETE wrapped in `requireAdmin()`
- **Modified**: `src/app/api/upload/route.ts` — POST wrapped in `requireAdmin()`
- **Added**: `src/middleware.ts` — `withAuth` middleware protecting `/admin/*` and `/api/*` mutating routes; allows public GET reads on `/api/markers` and `/api/categories`
- **Defense-in-depth**: three independent auth gates (middleware → server component → route handler)

#### R3 — SSRF handler removed from Caddyfile
- **Removed**: `@transform_port_query` handler that proxied requests to `localhost:{query.XTransformPort}` based on URL query parameter
- **Modified**: `Caddyfile` is now a plain `reverse_proxy localhost:3000` block with documented rationale for the removal

#### R5 — XSS surface closed
- **Added**: `src/lib/validation.ts` — zod schemas enforce:
  - `color`: regex `^#[0-9a-fA-F]{6}$` (closes XSS-via-color vector in `iconSvg()`)
  - `icon`: regex `^[a-z_]+$` (lowercase letters/underscore only)
  - `name`, `note`, `imageUrl`: trimmed, length-capped, URL-validated
  - `xPct`, `yPct`: numeric range 0–100
- **Added**: `src/lib/sanitize.ts` — `escapeHtml()`, `sanitizeText()`, `sanitizeForHtml()` server-side helpers (defense-in-depth for any future `dangerouslySetInnerHTML` usage)

#### Upload hardening
- **Modified**: `src/app/api/upload/route.ts`:
  - Now requires admin auth (was unauthenticated)
  - Filename entropy: 8 hex chars → 16 hex chars (32-char filename, 128-bit entropy)
  - **Added**: magic-bytes verification — first 12 bytes of uploaded file are checked against the declared MIME type (defends against renaming executables to .jpg)
  - **Added**: explicit `mkdir -p` for uploads directory (prevents 500 on first upload if dir doesn't exist)

### 🛠 Reliability (P1)

#### R8 — Silent catch blocks replaced with toast notifications
- **Added**: `ToastMessage` type + `toasts: ToastMessage[]` slice in Zustand store
- **Added**: `pushToast(text, kind)` and `dismissToast(id)` store actions
- **Added**: `<ToastContainer />` component in `ZoneMapApp.tsx` — renders toasts in bottom-right with auto-dismiss after 4s
- **Added**: `fadeInUp` CSS keyframe in `globals.css`
- **Modified**: every store action that previously did `.catch(() => {})` now:
  1. Saves previous state before optimistic update
  2. On HTTP error (4xx/5xx) or network failure: rolls back the optimistic update
  3. Pushes a toast with the human-readable error message
- **Affected actions**: `addMarker`, `updateMarker`, `removeMarker`, `clearAllMarkers`, `addCustomCategory`, `removeCustomCategory`

### 🏗 Build configuration

#### T8 — TypeScript strictness restored
- **Modified**: `tsconfig.json` — `noImplicitAny: false` → `noImplicitAny: true`
- **Modified**: `next.config.ts` — `typescript.ignoreBuildErrors: true` → `false`
- **Modified**: `next.config.ts` — added `eslint.ignoreDuringBuilds: false`
- **Modified**: `next.config.ts` — `reactStrictMode: false` → `true`

#### T25 — Prisma logs hardened
- **Modified**: `src/lib/db.ts` — production logs reduced from `['query', 'error', 'warn']` to `['error', 'warn']` (prevents SQL query data leaking into stdout)

### 📦 Dependencies added
- `bcryptjs@^2.4.3` — password hashing for admin auth

### 📦 Dependencies already present but now actually used
- `next-auth@^4.24.11` — was in package.json but unused; now fully configured
- `zod@^4.0.2` — was in package.json but unused; now powers all API request validation

### 📝 Documentation added
- `README.md` — setup, architecture changes, environment variables
- `CHANGELOG.md` — this file
- `.env.example` — documents required environment variables
- Documented rationale for each major change in source code comments

### 🚧 Known limitations of this edition
- **R6 (localStorage for map image)** — not yet fixed. Map image is still stored as a base64 data URL in localStorage. Roadmap item T10 will move this to server-side storage.
- **R4 (ZoneMapApp.tsx god component)** — not yet refactored. The 1201-line file is still intact, only extended with a `<ToastContainer />` component. Roadmap item T9.
- **T9 (refactor)** — not started. Multiple sub-components would need extraction; defer until tests exist (T19/T20).
- **T19/T20 (tests)** — not started. The codebase still has no unit or E2E tests.
- **T22 (realtime sync)** — not started. Markers still require page reload to see other players' additions.

### 🔧 Migration notes
1. **Before deploying**: generate `NEXTAUTH_SECRET` with `openssl rand -base64 32`
2. **Run `bun run db:push`** to apply the schema (adds `AdminUser` table)
3. **Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars** and run `bun run db:seed`
4. **Test login**: visit `/login`, sign in, verify redirect to `/admin`
5. **Verify API protection**: `curl -X DELETE http://localhost:3000/api/markers` should return 401 JSON
6. **Old `/admin` URL** still works — middleware redirects to `/login` if not signed in

### 🔗 Related artifacts
- Technical audit report (PDF): `download/LAST_HOPE_анализ.pdf`
- Original project: see git history for the unmodified codebase snapshot
