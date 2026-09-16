# School Admin Dashboard — Documentation & Production-Readiness Report

**Written:** 16 September 2026
**Repo:** `irawit1430/school-`
**Companion report (server):** `irawit1430/gps-backend` → `docs/PRODUCTION_READINESS.md`
**Language:** plain English.

---

## Part 0 — The short answer

| Question | Answer |
|---|---|
| Does it build? | ✅ Yes, cleanly. 12 pages, ~103 kB shared JavaScript. |
| Is the TypeScript clean? | ✅ Yes. Zero type errors. |
| Do the tests run? | ❌ **No.** All 18 test files fail to start on a fresh checkout. |
| Is there a CI pipeline? | ❌ **No.** There is no `.github` folder at all. |
| Is the repository clean? | ❌ No. 26 leftover scratch files are committed. |
| Can it be shown to a school today? | ✅ Yes — the app itself works. |
| Is it ready for a team to maintain long-term? | ⚠️ Not yet. Fix the tests and add CI first. |

**Frontend readiness: about 65%.** The app works. The engineering safety net around it
does not.

---

## Part 1 — What this app is

This is the **School Admin Dashboard** — the website the school transport office uses to
run their bus operation. It is one of four apps in the Voltava Fleet product:

| App | Status |
|---|---|
| **School Admin (this repo)** | ✅ Built — 11 screens, audited here |
| Super Admin | ✅ Built — repo outside this audit's scope |
| Parent (mobile) | ✅ Built — repo outside this audit's scope |
| Driver (mobile) | ✅ Built — repo outside this audit's scope |

> **Correction, 16 Sep 2026.** An earlier version of this table said the other three
> apps were not started, because `docs/frontend/OVERVIEW.md` in the backend repo
> lists their repos as **TBD**. The owner has confirmed they are built. They were not
> inspected, so nothing here speaks to their quality — but the finding is withdrawn,
> and that stale table should be updated.

It talks to the Voltava backend over a REST API and a live Socket.IO connection.
It has no database and no server logic of its own — it is a pure client.

### The screens

| Page | What an admin does there |
|---|---|
| `/login` | Log in. Handles rate-limit (429), field errors, and forced password reset |
| `/overview` | Dashboard — live map widget, KPIs, active routes, pending leaves |
| `/map` | Full-screen live fleet map |
| `/buses` | Add and manage buses, see online/offline status |
| `/drivers` | Add and manage drivers; shows a one-time password popup on create |
| `/students` | Students and attendance; CSV import and export; assign a child to a stop |
| `/routes` | Create routes, edit stops on a map, start/cancel trips |
| `/schedules` | Recurring run schedules (instead of creating trips by hand) |
| `/calendar` | School holidays and closures |
| `/leaves` | Approve or reject parent leave requests |
| `/cards` | Generate and print student QR cards |

---

## Part 2 — How it is built

### The stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript 5.9**
- **Tailwind CSS 4** for styling
- **Leaflet** for the live map, **Google Maps** for the route editor, **OSRM** for
  road-following route lines
- **Socket.IO client** for live updates
- **Recharts** for charts, **dnd-kit** for drag-and-drop stop ordering
- **Vitest** + **Playwright** for tests

### How it is deployed

`next.config.ts` sets `output: 'export'`. That means the whole app is compiled into
**plain static HTML and JavaScript files** and uploaded to **Firebase Hosting**
(project `rytfull-media01`). There is **no Node server running in production**.

This matters in two ways:

1. **Good for security** — no server to attack. The critical Next.js server-side
   vulnerabilities reported by `npm audit` do not apply to the deployed site, because
   no Next.js server exists there and image optimisation is switched off.
2. **A limitation** — Next.js middleware cannot run. That is why `middleware.ts` was
   renamed to `middleware.ts.bak`, and why the login check now lives in React code.

Caching headers in `firebase.json` are properly thought through: hashed asset files are
cached for a year; HTML pages are `no-cache` so a deploy reaches everyone immediately.

### How data flows

```
  localStorage: token + user
        │
        ▼
  lib/api.ts  ──── fetch ────►  https://api.voltava.in/api/...
        │                        (Authorization: Bearer <token>)
        │
        ├─ 401 → clear everything, redirect to /login
        ├─ 403 → "cross-tenant forbidden"
        ├─ 429 → "too many attempts, try again shortly"
        └─ 400 → field-level errors shown on the form
        │
  lib/apiCache.ts — short-lived cache so switching tabs does not refetch
        │
  Socket.IO ──► 'location_update'   → map markers move
             ──► 'emergency_alert'  → red banner
             ──► 'notification'     → bell in the header
```

Every URL is set in **one file**, `lib/config.ts`, driven by
`NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SOCKET_URL`. That is the right design —
switching from staging to production is one environment variable.

### Nice pieces of engineering in here

- **CSV formula-injection protection** — cells starting with `= + - @` are neutralised
  before export, so a student name cannot become a formula in Excel.
- **OSRM / Nominatim throttling** — an 1100 ms gate plus a coordinate-signature cache,
  so the route editor does not get the project IP banned.
- **Notification race protection** — a 15-second `skipPollUntil` lock after marking a
  notification read, so the 60-second poll cannot resurrect it.
- **Marker caching by a strict key** (`id-selected-alert-delayed`) so Leaflet does not
  rebuild every icon on every position update.
- **`apiErrorMessage()`** — shows the server's real reason ("that stop is already taken
  by X") instead of a generic "please try again".

---

## Part 3 — What I checked, and what I found

All run in a clean checkout on 16 Sep 2026.

| Check | Command | Result |
|---|---|---|
| Install | `npm ci` | ✅ clean |
| Type check | `npx tsc --noEmit` | ✅ **0 errors** |
| Production build | `npm run build` | ✅ 12 pages exported, 103 kB shared JS |
| Unit tests | `npx vitest run` | ❌ **18 of 18 files fail to start** |
| Logic tests | `npx playwright test --config playwright.unit.config.ts` | ⚠️ **35 passed**; 2 browser tests could not run here (no browser in this container) |
| Lint | `npx eslint .` | ❌ **10 errors, 9 warnings** |
| Dependency audit | `npm audit --omit=dev` | ⚠️ 8 issues (1 critical, 3 high) |
| CI | — | ❌ none exists |

### 3.1 The broken test suite 🔴

`vitest.setup.ts` contains one line:

```ts
import '@testing-library/jest-dom';
```

That package **is not in `package.json`**. Neither is `@testing-library/react`. So on any
machine that does not happen to have them lying around — a new developer's laptop, a
build server, a fresh clone — every test dies before running a single assertion:

```
Error: Failed to resolve import "@testing-library/jest-dom" from "vitest.setup.ts"
```

Roughly **41 component and API tests** have been written and are silently not running:
`lib/api.test.ts`, `lib/utils.test.ts`, `hooks/use-mobile.test.ts`,
`app/page.test.tsx`, `app/login/page.test.tsx`, `components/layout/Header.test.tsx`,
`components/views/Overview.test.tsx`, `components/views/LeaveRequests.test.tsx`,
`components/views/__tests__/StudentsAttendance.test.tsx`.

**Fix:** add `@testing-library/jest-dom` and `@testing-library/react` to
`devDependencies`, then run them and fix whatever they turn up.

There is also a **runner collision**: the files in `tests/*.spec.ts` import from
`@playwright/test`, but Vitest's default pattern also picks up `*.spec.ts`. The two
runners are fighting over the same files. Give Vitest an explicit `include` for
`*.test.*` only.

### 3.2 The lint errors 🟡

| File | Line | Problem |
|---|---|---|
| `app/(dashboard)/layout.tsx` | 21, 27 | `setState` called directly inside an effect |
| `components/layout/Header.tsx` | 188 | impure function called during render |
| `components/map/RealMap.tsx` | 235 | ref accessed during render |
| `components/map/RouteMapEditor.tsx` | 179, 210 | `setState` inside an effect |
| `components/views/BusesList.tsx` | 43 | `setState` inside an effect |
| `components/views/routes/EditTripModal.tsx` | 30 | `setState` inside an effect |
| `map_editor_backup.tsx` | 1 | file is not valid text ("appears to be binary") |
| `map_editor_backup_utf8.tsx` | 154 | `setState` inside an effect (dead file) |

These are React correctness issues. They cause extra render passes and occasional
flicker — especially on the map, which is the screen that renders most often. They do
not crash the app.

`next.config.ts` sets `eslint.ignoreDuringBuilds: true`, so **the build never shows any
of this**. Once the errors are fixed, that flag should be turned off, otherwise lint has
no teeth.

### 3.3 The 26 junk files 🟡

Committed and tracked:

```
fix.py · fix_api.py · fix_fetch.py · fix_fetch_notifs.py · fix_remaining.py
fix_route_editor.py · mass_refactor.py · patch_student.py · replace_logo.py
replace_logo_real.py · revert_notifs.py · patch-manage-routes.js · patch-map-editor.js
map_editor_backup.tsx · map_editor_backup_utf8.tsx · map_old.tsx (empty) · middleware.ts.bak
map_fragment.txt · map_fragment2.txt · replace_1034.txt · replace_1185.txt
replace_1248.txt · target_1214.txt · target_1248.txt
test-search.js · test-search2.js · playwright-report/index.html
```

These are one-off editing scripts and half-finished snippets from past refactors. Three
of them (`test-search.js`, `test-search2.js`, and `components/layout/Header.test.tsx`)
still point at the **dead Render URL** `gps-backend-jzd7.onrender.com`. None of it ships
in the build, but it makes the repository hard to read and keeps lint permanently red.

### 3.4 Dependency vulnerabilities 🟡

8 total: 1 critical, 3 high, 4 moderate.

| Severity | Package | Note |
|---|---|---|
| Critical | `next` 15.5.23 | Server-side RCEs — **do not affect the deployed static site**, but do affect `next dev` and the build machine |
| High | `sharp` | libvips image library CVEs |
| High | `postcss` | XSS via unescaped `</style>`; arbitrary file read |
| High | `fast-uri` | host confusion / SSRF |
| Moderate | `hono`, `qs`, `body-parser`, `express` | build-tool dependencies |

Upgrade Next.js and run `npm audit fix`. Because the site is a static export, the
urgency is lower than the word "critical" suggests — but it should still be done.

### 3.5 Login protection — by design, not a bug 🟢

`app/(dashboard)/layout.tsx` checks `localStorage` for a token and redirects to
`/login` if there is none. Anybody can bypass that redirect in a browser console.

**This is fine.** The pages themselves contain no data. Every piece of information comes
from the API, which rejects any request without a valid token, and enforces which school
the user belongs to on the server side. The redirect is a convenience, not a security
control, and the real security control is in the right place.

The one small thing worth noting: the token is kept in `localStorage`, so any XSS bug
anywhere in the app could read it. That is normal for dashboards of this kind, but it
means XSS is a higher-severity class of bug here than it would be with an HttpOnly cookie.

### 3.6 A small inconsistency

`lib/config.ts` defines `TOKEN_STORAGE_KEY: 'voltava_token'`, but `lib/api.ts` reads and
writes the literal string `'token'`. The user object uses the CONFIG key correctly; the
token does not. It works — both sides use `'token'` consistently — but the constant is
misleading and should either be used or removed.

---

## Part 4 — Readiness scorecard (frontend only)

| Area | Score | Why |
|---|---|---|
| Features built | 8 / 10 | All 11 admin screens exist and are wired to real APIs |
| Build & types | 9 / 10 | Clean build, zero type errors, sensible bundle size |
| API integration | 8 / 10 | One config file, one fetch wrapper, proper 401/403/429 handling |
| Real-time | 8 / 10 | Socket auth, live map, live alerts, live notifications all working |
| **Testing** | **2 / 10** | Suite cannot start; ~41 tests have never run |
| **CI/CD** | **1 / 10** | No pipeline at all. Deploy is one manual `npm run deploy` |
| Code hygiene | 4 / 10 | 26 junk files, 10 lint errors, lint disabled in builds |
| Security posture | 7 / 10 | Correct model (server enforces everything); localStorage token; dependency CVEs |
| Error handling / UX | 8 / 10 | Real error messages, optimistic updates, skeletons, toasts |
| Documentation | 8 / 10 | `CONTEXT.md` and `FRONTEND_ARCHITECTURE_DOC.md` are detailed and accurate |

### **Overall frontend: ~65% production-ready.**

The app is genuinely usable. What is missing is everything that stops it *staying*
usable as more people work on it.

---

## Part 5 — What to do, in order

### Do first (a day's work) 🔴

1. **Add the missing test dependencies** —
   `npm i -D @testing-library/jest-dom @testing-library/react @testing-library/user-event`
   — then run `npx vitest run` and fix what breaks. Right now nobody knows whether those
   41 tests pass.
2. **Separate the two test runners.** Give `vitest.config.mts` an explicit
   `include: ['**/*.test.{ts,tsx}']` so it stops grabbing the Playwright files.
3. **Add a CI workflow** (`.github/workflows/ci.yml`): install → `tsc --noEmit` → lint →
   test → build, on every push and pull request. The backend repo already has one to copy.
4. **Delete the 26 junk files** in one commit.

### Do soon (a week) 🟡

5. **Fix the 8 real lint errors**, then set `eslint.ignoreDuringBuilds: false`.
6. **Upgrade Next.js** and run `npm audit fix`.
7. **Point the two stale Render URLs** at the config, or delete those files.
8. **Get the Playwright browser tests running in CI** — the two E2E tests in
   `tests/dashboard.spec.ts` need a browser and a server; wire that into the pipeline.
9. **Remove or use `CONFIG.TOKEN_STORAGE_KEY`.**

### Do before the product scales 🟢

10. **Add error tracking** (Sentry or similar) so a React crash in a school's office is
    visible to you, not just to them.
11. **Automate the deploy** — right now `npm run deploy` runs a build and a Firebase
    deploy from whoever's laptop is handy, with no check that tests passed first.
12. **Add a staging environment** pointing at a staging backend.
13. **Check accessibility and mobile** — the sidebar has a mobile drawer, but the data
    tables have not been reviewed on a phone.

---

## Part 6 — Honest summary

**What is good:** the app is complete for its role, properly typed, builds clean, has a
single well-designed API layer, handles errors in a way that actually helps the person
using it, and solves several genuinely tricky problems well (map marker caching, OSRM
throttling, notification race conditions, CSV injection).

**What is not:** the test suite has been dead for long enough that nobody noticed, there
is no CI to notice it, lint is switched off in the build, and the repository is full of
the debris of past refactors.

None of that is visible to a school using the dashboard today. All of it will be visible
the first time somebody changes a file and quietly breaks something else.

---

## Appendix — commands

```bash
npm ci                    # install
npm run dev               # local dev server on :3000
npx tsc --noEmit          # type check          → clean
npm run build             # static export → out/ → clean
npm run deploy            # build + firebase deploy (project rytfull-media01)
npx eslint .              # → 10 errors, 9 warnings
npx vitest run            # → BROKEN, missing @testing-library/jest-dom
npx playwright test --config playwright.unit.config.ts   # → 35 logic tests pass
```

### Key files

| Path | Job |
|---|---|
| `lib/config.ts` | The only place API and socket URLs are set |
| `lib/api.ts` | Every API call + the `ApiError` class + socket connection |
| `lib/apiCache.ts` | Short-lived GET cache |
| `lib/runs.ts` | Recurring-schedule logic (the best-tested file in the repo) |
| `lib/osrm.ts` | Road-following route lines, throttled and cached |
| `app/(dashboard)/layout.tsx` | Login redirect, sidebar, header, alert banner |
| `components/map/RealMap.tsx` | Live Leaflet fleet map |
| `components/map/RouteMapEditor.tsx` | Google-maps based stop editor |
| `components/views/` | One file per screen |
