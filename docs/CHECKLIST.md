# Eventora: Final Verification & Architectural Polish Checklist

This checklist confirms verification of all domain requirements, security guarantees, edge case defenses, mobile ergonomic optimizations, and visual standards across the codebase.

---

## 🌟 Core Specification Features

- [x] **Comprehensive Analytics & NAAC/NBA Accreditation Export**
  - SQL aggregate post-mortem analytics document (funnel, arrival curve, scan stats, meal/kit redemptions, ratings histogram).
  - Privacy suppression rule: Demographics cohorts with fewer than 3 attendees are suppressed as `"Fewer than 3"` to prevent student re-identification.
  - Multi-format accreditation export (`PDF`, `CSV`, `XLSX`) with date range filtering.
  - *Files:* `apps/api/src/modules/analytics/service.ts`, `apps/api/src/modules/analytics/routes.ts`, `apps/web/src/features/organizer/AnalyticsPage.tsx`

- [x] **Winners Podium & Judging Workflow**
  - Podium display highlighting 1st, 2nd, and 3rd place winners with trophy icons and distinct medals.
  - Organizer judging panel supporting submission scores, project repo links, demo URLs, and winner declaration.
  - *Files:* `apps/api/src/modules/winners/service.ts`, `apps/web/src/features/event/EventPage.tsx`, `apps/web/src/features/organizer/TeamsPanel.tsx`

- [x] **LinkedIn Accomplishment Post Integration**
  - Native clipboard copy of achievement narrative and one-click launch of LinkedIn offsite sharing dialogue (`linkedin.com/sharing/share-offsite`).
  - Dynamic OG image generation card with campus branding and attendee name.
  - *Files:* `apps/api/src/modules/verify/routes.ts`, `apps/web/src/features/passport/PassportPage.tsx`, `apps/web/src/features/event/EventPage.tsx`

- [x] **Tamper-Proof Auto-OD (On-Duty) Letters**
  - Server-side PDFKit document with college seal, session timestamps, and faculty coordinator digital signature stamp.
  - SHA-256 HMAC cryptographic verification hash and verification route `/verify/od/:serial`.
  - Check-in gate guard: Letters can only be generated if ticket status is `CHECKED_IN`.
  - *Files:* `apps/api/src/modules/od/service.ts`, `apps/api/src/modules/od/routes.ts`, `apps/web/src/features/verify/VerifyOdPage.tsx`

- [x] **Club Budget Ledger & Expense Receipts**
  - Multi-source allocation tracking, real-time budget burn calculations, and semantic spend status coloring.
  - Cloudflare R2 presigned receipt uploads and CSV expense ledger export (`/clubs/:clubId/budget/export.csv`).
  - *Files:* `apps/api/src/modules/budget/service.ts`, `apps/web/src/features/organizer/BudgetPage.tsx`

- [x] **Volunteer Passkeys & Spot Walk-In Check-In**
  - 6-digit numeric passkey generation (`SCAN-######`) and setup QR generator.
  - Fastify route guard isolating scanner tokens to `/gate/*` endpoints only.
  - Single-handed PWA scanner with live counters, roll lookup sheet, and spot walk-in admission.
  - Mode switcher buttons: `[ Gate Entry ]`, `[ Lunch Counter ]`, `[ Kit Desk ]`.
  - Cloudflare Turnstile widget on scanner passkey unlock page.
  - *Files:* `apps/api/src/modules/passkeys/service.ts`, `apps/api/src/modules/gate/service.ts`, `apps/web/src/features/scanner/ScannerPage.tsx`, `apps/web/src/features/scanner/ScannerUnlockPage.tsx`

- [x] **Scanner Offline Security & Yellow Feedback Mapping (Prompt 17 Strict Guard)**
  - Atomic guard: Zero IndexedDB queuing, retry loops, or background sync logic. If offline or network connection fails, camera processing immediately halts and Amber banner displays: `"Offline: scanning paused. Live database connection required."` Unconfirmed scans are dropped completely.
  - High-contrast Yellow Feedback: Background `#D97706` with text `#0F172A`, mapping `WRONG_EVENT`, `INVALID_TOKEN`, `VOID`, and `NOT_CHECKED_IN` to their distinct user explanations.
  - Haptic feedback: `navigator.vibrate([200, 100, 200])` for both `RED` and `YELLOW` states.
  - *Files:* `apps/web/src/features/scanner/ScannerPage.tsx`, `apps/web/src/features/scanner/scanner-sound.ts`, `apps/web/src/__tests__/scanner-community.test.tsx`

- [x] **Event Detail CTA Copy & Queue Position**
  - Registration CTA renders `"Join Queue"` when capacity is 0 and user has not joined, and `"Join Queue (Position #N)"` once waitlist position is known.
  - *Files:* `apps/web/src/features/event/EventPage.tsx`, `apps/api/src/modules/events/routes.ts`, `e2e/atomic-concurrency.spec.ts`

- [x] **No-Show Strike & Cooldown Engine**
  - Automated sweep marking unattended registrations as `NO_SHOW` 2 hours post-event.
  - Strike engine applying a 14-day booking cooldown to students with 3 or more consecutive no-shows.
  - *Files:* `apps/api/src/workers/strike.worker.ts`, `apps/api/src/modules/strikes/service.ts`

- [x] **WhatsApp-Style Club Community Spaces**
  - Desktop split pane / mobile stacked navigation with channel lists (`#announcements`, `#general`, `#events`).
  - Virtualized chat thread powered by `@tanstack/react-virtual` supporting 5,000+ messages without layout jumps.
  - Role badges (`ORGANIZER`, `FACULTY`, `VOLUNTEER`, `ATTENDEE`, `WINNER`), `EVENT_CARD` rich previews, and live doubt rooms.
  - *Files:* `apps/api/src/modules/channels/service.ts`, `apps/web/src/features/community/ChatThread.tsx`, `apps/web/src/features/community/CommunityPage.tsx`

---

## 🛡️ Edge Case Defenses

- [x] **QR Screenshot Duplication Defense:**
  - First scan returns `GREEN` (`#059669`) with attendee name.
  - Instant duplicate scan of the same ticket flips viewport to `RED` (`#E11D48`) and reveals original scan timestamp and volunteer name.
  - *Files:* `apps/api/src/modules/gate/service.ts`, `e2e/negative-security.spec.ts`

- [x] **Concurrent Rush Seat Invariant:**
  - 25 concurrent clients racing for 1 seat yields exactly 1 `CONFIRMED` and 24 `WAITLISTED` with remaining capacity 0.
  - *Files:* `apps/api/src/modules/registrations/service.ts`, `apps/api/src/__tests__/concurrency.test.ts`, `e2e/atomic-concurrency.spec.ts`

- [x] **Form Mutation Lock (Frozen Schema):**
  - Schema locked immediately upon the first attendee registration.
  - Existing fields become read-only with lock icons; only new optional questions can be appended.
  - *Files:* `apps/api/src/modules/forms/service.ts`, `apps/web/src/features/builder/FormBuilderPage.tsx`, `e2e/form-freeze.spec.ts`

- [x] **Waitlist Ghosting & Offer Expiry:**
  - Background worker sweeping expired offers every 15s to automatically promote next in queue.
  - Test helper endpoint `POST /test/expire-offers` triggers instant sweep in test environments.
  - *Files:* `apps/api/src/workers/offer-expiry.worker.ts`, `e2e/waitlist-promotion.spec.ts`

---

## 📱 Mobile Ergonomics & Visual Standards

- [x] **Thumb-Zone Bottom Sheets:**
  - Fixed single-handed bottom reach controls for mode switching, flash toggle, roll lookup, and spot register.
  - Minimum touch targets of 48px+ for effortless one-handed gate operation.
  - *Files:* `apps/web/src/features/scanner/ScannerPage.tsx`

- [x] **Cumulative Layout Shift (CLS) = 0:**
  - Skeleton loaders mirror dimensions of real event cards, chat bubbles, and dashboard metrics.
  - Virtual scroll maintains exact pixel offset during upward reverse pagination.
  - *Files:* `apps/web/src/components/primitives/skeleton-card.tsx`, `apps/web/src/features/community/ChatThread.tsx`

- [x] **Dark-Mode Contrast & Semantic Token System:**
  - High-contrast canvas background `#0b0f19` and foreground `#F8FAFC`.
  - Contrast verified across all status states: Valid Green `#059669`, Duplicate Red `#E11D48`, Caution Yellow `#D97706`.
  - *Files:* `apps/web/src/styles/tokens.css`, `apps/web/src/__tests__/tokens-contrast.test.ts`

- [x] **Zero Placeholder Policy:**
  - Checked repository for all occurrences of `TODO`, `FIXME`, or `not implemented`.
  - Automated check: `grep -RIn "TODO\|FIXME\|not implemented" apps packages --include=*.ts --include=*.tsx` outputs `NO PLACEHOLDERS`.

---

## 18. Deployment & Production Hardening (Prompt 19)

- [x] **Local Connectivity & Dev Orchestration (web :3000 -> API :4000):**
  - Web Vite server locked to port 3000 (`strictPort: true`, `host: true`, `envDir: ../../`): [apps/web/vite.config.ts](file:///C:/sai%20projects/smartcampus/apps/web/vite.config.ts)
  - Environment defaults set to `PUBLIC_WEB_URL=http://localhost:3000`, `PUBLIC_API_URL=http://localhost:4000`, `VITE_API_URL=http://localhost:4000`: [.env.example](file:///C:/sai%20projects/smartcampus/.env.example) and [.env](file:///C:/sai%20projects/smartcampus/.env)
  - Fastify CORS allowlist function permitting `PUBLIC_WEB_URL` plus localhost:3000, localhost:5173, and 127.0.0.1:3000 in dev only, with 204 preflight and Helmet `crossOriginResourcePolicy: { policy: 'cross-origin' }`: [apps/api/src/server.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/server.ts)
  - Frontend API client reading `VITE_API_URL`, build-time validation in production mode, and descriptive connection error toasts: [apps/web/src/lib/api.ts](file:///C:/sai%20projects/smartcampus/apps/web/src/lib/api.ts)
  - Monorepo `dev:all` command orchestrating API and web via concurrently: [package.json](file:///C:/sai%20projects/smartcampus/package.json)
  - Automated local connectivity check scripts: [scripts/check-dev.ps1](file:///C:/sai%20projects/smartcampus/scripts/check-dev.ps1) and [scripts/check-dev.sh](file:///C:/sai%20projects/smartcampus/scripts/check-dev.sh)
  - Unit tests verifying preflight headers for localhost:3000 and total rejection for evil.example: [apps/api/src/__tests__/production-hardening.test.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/__tests__/production-hardening.test.ts)

- [x] **Strengthened Scanner Rendering Tests:**
  - Individual rendering tests for all four rejection reasons (`WRONG_EVENT`, `INVALID_TOKEN`, `VOID`, `NOT_CHECKED_IN`) verifying exact rejection copy and amber `#D97706` background: [apps/web/src/__tests__/scanner-community.test.tsx](file:///C:/sai%20projects/smartcampus/apps/web/src/__tests__/scanner-community.test.tsx)
  - Dedicated duplicate RED rendering test verifying "DUPLICATE TICKET", formatted scan timestamp, and volunteer label: [apps/web/src/__tests__/scanner-community.test.tsx](file:///C:/sai%20projects/smartcampus/apps/web/src/__tests__/scanner-community.test.tsx)

- [x] **API Production Hardening & Invariants:**
  - Production startup guard in [apps/api/src/env.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/env.ts) refusing to boot on live payment gateways, dummy Turnstile keys, short secrets (<32 chars), non-https web URLs, missing database credentials, or unofficial WhatsApp providers (`baileys`).
  - Strict isolation: `x-test-user-id` bypass inactive in production, `/test/*` routes unregistered, and Turnstile `test-pass` strictly blocked with 403: [apps/api/src/server.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/server.ts) and [apps/api/src/lib/turnstile.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/lib/turnstile.ts)
  - Fastify production options (`trustProxy: true`, `bodyLimit: 1MB`, `requestTimeout: 30s`, `keepAliveTimeout: 65s`, and 10s bounded graceful shutdown): [apps/api/src/server.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/server.ts) and [apps/api/src/index.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/index.ts)
  - Health endpoints: lightweight liveness (`/health`) and migration/database readiness (`/ready`): [apps/api/src/server.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/server.ts)
  - Structured Pino log redaction masking headers, session cookies, tokens, and passkeys: [apps/api/src/server.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/server.ts)
  - Release metadata endpoint (`/version`): [apps/api/src/server.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/server.ts)
  - Migration runner using PostgreSQL advisory lock (`pg_advisory_lock`): [apps/api/src/db/migrate.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/db/migrate.ts)
  - Demo seed guard requiring explicit `ALLOW_DEMO_SEED=true`: [apps/api/src/db/seed.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/db/seed.ts)
  - Idempotent minimal production bootstrap script: [apps/api/src/db/bootstrap.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/db/bootstrap.ts)
  - Admin bootstrap from `INITIAL_ADMIN_EMAILS`: [apps/api/src/modules/webhooks/clerk.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/modules/webhooks/clerk.ts) and [apps/api/src/plugins/auth.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/plugins/auth.ts)
  - SSL enforcement and connection pool sizing: [apps/api/src/db/client.ts](file:///C:/sai%20projects/smartcampus/apps/api/src/db/client.ts)
  - Node 22 engine specification: [package.json](file:///C:/sai%20projects/smartcampus/package.json), [apps/api/package.json](file:///C:/sai%20projects/smartcampus/apps/api/package.json), [apps/web/package.json](file:///C:/sai%20projects/smartcampus/apps/web/package.json), [.nvmrc](file:///C:/sai%20projects/smartcampus/.nvmrc), and [apps/api/Dockerfile](file:///C:/sai%20projects/smartcampus/apps/api/Dockerfile)

- [x] **Frontend Production & Edge Routing:**
  - Cloudflare Pages SPA rewrite: [apps/web/public/_redirects](file:///C:/sai%20projects/smartcampus/apps/web/public/_redirects)
  - Vercel SPA rewrite and security headers configuration: [apps/web/vercel.json](file:///C:/sai%20projects/smartcampus/apps/web/vercel.json)
  - Cloudflare Pages security headers and dynamic CSP generation: [apps/web/public/_headers](file:///C:/sai%20projects/smartcampus/apps/web/public/_headers) and [apps/web/scripts/gen-headers.mjs](file:///C:/sai%20projects/smartcampus/apps/web/scripts/gen-headers.mjs)
  - Service Worker workbox caching rules ensuring `/gate/*`, `/scanner/*`, `/tickets/*/qr.*`, and all authenticated calls are NetworkOnly: [apps/web/vite.config.ts](file:///C:/sai%20projects/smartcampus/apps/web/vite.config.ts) and [apps/web/src/__tests__/workbox-pwa.test.ts](file:///C:/sai%20projects/smartcampus/apps/web/src/__tests__/workbox-pwa.test.ts)
  - Production build sourcemaps disabled: [apps/web/vite.config.ts](file:///C:/sai%20projects/smartcampus/apps/web/vite.config.ts)
  - Global accessible 404 page: [apps/web/src/features/error/NotFoundPage.tsx](file:///C:/sai%20projects/smartcampus/apps/web/src/features/error/NotFoundPage.tsx)

- [x] **Docker, Hosting & Operational Runbooks:**
  - Multi-stage container image based on `node:22-slim`: [apps/api/Dockerfile](file:///C:/sai%20projects/smartcampus/apps/api/Dockerfile) and [.dockerignore](file:///C:/sai%20projects/smartcampus/.dockerignore)
  - Production Docker Compose stack (PostgreSQL 16, API, Cloudflare Tunnel): [docker-compose.prod.yml](file:///C:/sai%20projects/smartcampus/docker-compose.prod.yml) and [.env.production.example](file:///C:/sai%20projects/smartcampus/.env.production.example)
  - Complete hosting guide covering PostgreSQL via Docker Compose, Cloudflare Tunnel, Cloudflare Pages, R2 CORS, Clerk, Turnstile, and Resend: [docs/DEPLOYMENT.md](file:///C:/sai%20projects/smartcampus/docs/DEPLOYMENT.md)
  - Operations runbook covering rollbacks, secret rotation (`OD_SEAL_SECRET_PREVIOUS`), automated nightly `pg_dump` backups, and emergency passkey revocation: [docs/RUNBOOK.md](file:///C:/sai%20projects/smartcampus/docs/RUNBOOK.md) and [scripts/backup-db.sh](file:///C:/sai%20projects/smartcampus/scripts/backup-db.sh)
  - Continuous integration workflows and Dependabot: [.github/workflows/ci.yml](file:///C:/sai%20projects/smartcampus/.github/workflows/ci.yml), [.github/workflows/docker.yml](file:///C:/sai%20projects/smartcampus/.github/workflows/docker.yml), and [.github/dependabot.yml](file:///C:/sai%20projects/smartcampus/.github/dependabot.yml)
  - Post-deploy automated smoke verification script: [scripts/smoke-prod.mjs](file:///C:/sai%20projects/smartcampus/scripts/smoke-prod.mjs) (`pnpm smoke:prod`)

