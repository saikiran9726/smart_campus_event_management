# Eventora: Smart Campus Event OS

> A resilient, high-concurrency campus event operating system engineered with zero-trust gate security, atomic seat reservation guarantees, automated accreditation pipelines, and real-time community spaces.

---

## 🏛️ System Architecture Overview

Eventora is structured as an enterprise-grade TypeScript monorepo orchestrated with `pnpm`:

```
eventora/
├── apps/
│   ├── api/                   # Fastify HTTP & Socket.IO backend (Node.js 20+)
│   │   ├── src/
│   │   │   ├── db/            # Drizzle ORM schema, migrations, connection pools, and seeders
│   │   │   ├── modules/       # Domain modules (auth, events, forms, gate, passkeys, waitlist, od, etc.)
│   │   │   ├── realtime/      # Socket.IO rooms, connection handlers, and typing throttlers
│   │   │   ├── workers/       # Background cron workers (offer-expiry, payment-hold, strikes, comms)
│   │   │   └── server.ts      # Fastify server instance, security plugins, error handlers, and guards
│   └── web/                   # Vite React TypeScript PWA with Tailwind CSS & shadcn/ui
│       ├── src/
│       │   ├── features/      # Feature modules (scanner, community, discovery, passport, builder, etc.)
│       │   ├── components/    # Reusable UI primitives, app-shell, dialogs, sheets, and badges
│       │   ├── lib/           # API fetch client, socket provider, auth context, and sound engine
│       │   └── styles/        # Tokens, theme palettes, and dark-mode CSS
├── packages/
│   └── shared/                # Universal shared schemas, domain types, token generators, and validators
├── e2e/                       # Playwright end-to-end integration test suite
├── scripts/                   # Viva runbook scripts and headless concurrency benchmarks
└── docs/                      # Architectural verification checklist and documentation
```

### Technology Stack
- **Backend API:** Fastify 5, Drizzle ORM, PostgreSQL (node-postgres with pooling), Socket.IO 4, Jose (JWT), QRCode, Sharp, PDFKit, Satori, Resvg.
- **Frontend Web:** React 18, Vite 5, Tailwind CSS, `@tanstack/react-query`, `@tanstack/react-virtual`, `@dnd-kit`, jsQR, WebAudio API, Service Worker PWA (`vite-plugin-pwa`).
- **Authentication & RBAC:** Clerk test-bypass headers, Role-based Access Control (`STUDENT`, `ORGANIZER`, `FACULTY`, `ADMIN`), scoped volunteer scanner JWTs.

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js `v20.x` or higher
- `pnpm` `v9.x`
- PostgreSQL 15+ running locally or via Docker

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-org/eventora.git
cd eventora
pnpm install --frozen-lockfile
```

### 2. Configure Environment Variables
Copy `.env.example` (or configure `.env` at repo root):
```bash
cp .env.example .env
```

### 3. Database Migration & Seed
Run database migrations and populate realistic campus demo data:
```bash
pnpm --filter api db:migrate
pnpm --filter api db:seed
```

### 4. Start Development Services
Run all services concurrently:
```bash
pnpm dev
```
- Web Application: [http://localhost:3000](http://localhost:3000)
- Backend REST API: [http://localhost:3001](http://localhost:3001)
- Health Check: [http://localhost:3001/health](http://localhost:3001/health)

---

## ⚙️ Environment Variables Reference

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment (`development`, `test`, `production`) | `development` |
| `PORT` | API server port | `3001` (or `4000`) |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/eventora` |
| `PUBLIC_WEB_URL` | Base public URL for web frontend | `http://localhost:3000` |
| `PUBLIC_API_URL` | Base public URL for backend API | `http://localhost:3001` |
| `CLERK_PUBLISHABLE_KEY` | Clerk authentication publishable key | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk backend secret key | `sk_test_...` |
| `CLERK_WEBHOOK_SECRET` | Svix webhook signing secret | `whsec_...` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key | `0x4AAAAAA...` |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key | `0x4AAAAAA...` |
| `MAGIC_LINK_SECRET` | HMAC secret for single-use decision tokens (min 32 chars) | `32+ char cryptographic secret` |
| `OD_SEAL_SECRET` | HMAC secret for On-Duty PDF tamper-proof digital seals | `32+ char cryptographic secret` |
| `PAYMENT_MODE` | Payment simulation mode (**MUST** be `sandbox`) | `sandbox` |
| `R2_ACCOUNT_ID` | Cloudflare R2 / S3 Account ID | `eventora-r2-id` |
| `R2_BUCKET` | Storage bucket for receipts, posters, and decks | `eventora-assets` |

---

## 🔒 Core Security Invariants

1. **Opaque QR Ticket Tokens:**
   - Ticket tokens follow the strict format `ev_tok_[A-Za-z0-9]{25}` (exactly 32 characters, base62 entropy).
   - Full tokens are never written to unredacted server logs or audit trails (only prefix hashes are logged).
   - Gate scanning verifies tokens against duplicate usage in under 5ms using atomic database locks.

2. **ACID Atomic Seat Reservation:**
   - Seat reservation consumes seats atomically inside a database transaction utilizing PostgreSQL table locks and advisory locks.
   - For an event with capacity $N$, under any concurrency rush, exactly $N$ seats are confirmed and all surplus registrations are placed on the FIFO waitlist with zero overselling.

3. **Frozen Form Mutation Policy:**
   - Once the first attendee registers for an event, the registration form schema is frozen.
   - Existing questions cannot be edited or deleted, preserving historical audit integrity.
   - Only new optional questions (`required = false`) can be appended to the form.

4. **Single-Use Magic Link Decisions:**
   - Faculty approval tokens and proposal review links are cryptographically signed with HMAC-SHA256 and expire within 72 hours.
   - Upon consumption, the token is recorded and permanently invalidated. Subsequent visits return `410 OFFER_EXPIRED` or `409 TOKEN_USED`.

5. **Least-Privilege Volunteer Scanner:**
   - Volunteer scanners unlock via ephemeral passkeys (`SCAN-######`) generating scoped 8-hour JWTs.
   - Strict server and client route guards restrict scanner sessions exclusively to `/gate/*` and `/scanner` endpoints.
   - Sensitive attendee PII (phone numbers, payment information, dynamic form answers) is never fetched or rendered on scanner devices.

---

## 💳 Simulated Sandbox Payment Statement

> **IMPORTANT:** Eventora operates exclusively with a 100% simulated sandbox payment system (`PAYMENT_MODE=sandbox`). No real monetary transactions, bank accounts, or external payment gateways are touched. All payment flows (card simulation, UPI intent simulation, and payment hold timers) run within a local atomic mock state machine.

---

## 🧪 Verification & Test Suite

The monorepo includes end-to-end integration tests, concurrency race stress tests, and automated accessibility checks.

### Run Verification Gate
```bash
# 1. Typecheck & Lint
pnpm -r typecheck && pnpm -r lint

# 2. Production Build
pnpm -r build

# 3. Unit & Integration Tests (260+ tests)
pnpm -r test

# 4. ACID Concurrency Engine (10 repeated trials, 25 clients racing for 1 seat)
pnpm --filter api test:concurrency

# 5. Playwright E2E Suite
pnpm e2e

# 6. Verify Zero TODOs / Placeholders
grep -RIn "TODO\|FIXME\|not implemented" apps packages --include=*.ts --include=*.tsx || echo "NO PLACEHOLDERS"

# 7. Headless Viva Concurrency Benchmark
bash scripts/viva.sh --headless
```

### Seeded Credentials for Interactive Demo
- **Student:** `arjun.mehta@eventora.campus.edu` (`user_student_001`)
- **Organizer:** `priya.patel@eventora.campus.edu` (`user_organizer_001`)
- **Faculty Coordinator:** `dr.sharma@eventora.campus.edu` (`user_faculty_001`)
- **Administrator:** `admin@eventora.campus.edu` (`user_admin_001`)
