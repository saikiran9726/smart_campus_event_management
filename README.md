# Eventora: Smart Campus Event OS

> A resilient, high-concurrency campus event operating system engineered with zero-trust gate security, atomic seat reservation guarantees, automated accreditation pipelines, and real-time community spaces.

---

## 🏛️ System Architecture Overview

Eventora is structured as an enterprise-grade TypeScript monorepo orchestrated with `pnpm`:

```
eventora/
├── apps/
│   ├── api/                   # Fastify HTTP & Socket.IO backend (Node.js 22+)
│   │   ├── src/
│   │   │   ├── db/            # Drizzle ORM schema, migrations, connection pools, and seeders
│   │   │   ├── modules/       # Domain modules (auth, events, forms, gate, passkeys, waitlist, od, etc.)
│   │   │   ├── realtime/      # Socket.IO rooms, connection handlers, and typing throttlers
│   │   │   ├── workers/       # Background cron workers (offer-expiry, payment-hold, strikes, comms)
│   │   │   └── server.ts      # Fastify server instance, security plugins, error handlers, and guards
│   │   └── Dockerfile         # Multi-stage production container image (node:22-slim)
│   └── web/                   # Vite React TypeScript PWA with Tailwind CSS & shadcn/ui
│       ├── src/
│       │   ├── features/      # Feature modules (scanner, community, discovery, passport, builder, etc.)
│       │   ├── components/    # Reusable UI primitives, app-shell, dialogs, sheets, and badges
│       │   ├── lib/           # API fetch client, socket provider, auth context, and sound engine
│       │   └── styles/        # Tokens, theme palettes, and dark-mode CSS
│       └── public/            # Static assets, PWA manifest, _redirects, and _headers (CSP)
├── packages/
│   └── shared/                # Universal shared schemas, domain types, token generators, and validators
├── e2e/                       # Playwright end-to-end integration test suite
├── scripts/                   # Viva runbook scripts, dev check, and post-deploy smoke tests
└── docs/                      # Architectural verification checklist, runbook, and deployment guide
    ├── CHECKLIST.md           # Master architectural verification checklist
    ├── DEPLOYMENT.md          # Step-by-step production hosting guide (PostgreSQL 16 + Cloudflare)
    └── RUNBOOK.md             # Operations, secret rotation, and incident runbook
```

### Technology Stack
- **Backend API:** Fastify 5, Drizzle ORM, PostgreSQL (node-postgres with pooling & SSL), Socket.IO 4, Jose (JWT), QRCode, Sharp, PDFKit, Satori, Resvg.
- **Frontend Web:** React 18, Vite 5, Tailwind CSS, `@tanstack/react-query`, `@tanstack/react-virtual`, `@dnd-kit`, jsQR, WebAudio API, Service Worker PWA (`vite-plugin-pwa`).
- **Authentication & RBAC:** Clerk test-bypass headers, Role-based Access Control (`STUDENT`, `ORGANIZER`, `FACULTY`, `ADMIN`), scoped volunteer scanner JWTs.

---

## 🚀 Setup & Local Development

### Prerequisites
- Node.js `v22.x` (or higher)
- `pnpm` `v9.x`
- PostgreSQL 15+ running locally or via Docker

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-org/eventora.git
cd eventora
pnpm install --frozen-lockfile
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` at repo root:
```bash
cp .env.example .env
```

### 3. Database Migration & Seed
Run database migrations and populate campus demo data:
```bash
pnpm --filter api db:migrate
pnpm --filter api db:seed
```

### 4. Start Development Services Concurrently
Run backend API and frontend web application simultaneously:
```bash
pnpm dev:all
```
- Web Application: [http://localhost:3000](http://localhost:3000)
- Backend REST API: [http://localhost:4000](http://localhost:4000)
- Liveness Probe: [http://localhost:4000/health](http://localhost:4000/health)
- Readiness Probe: [http://localhost:4000/ready](http://localhost:4000/ready)

Verify local connectivity via:
```powershell
powershell -File scripts/check-dev.ps1
```
*(or `bash scripts/check-dev.sh` on POSIX systems)*

---

## 🌐 Production Deployment & Infrastructure

Eventora is designed for turnkey deployment on modern cloud primitives:
- Detailed guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Operational runbook: [docs/RUNBOOK.md](docs/RUNBOOK.md)
- Docker Compose production stack: [`docker-compose.prod.yml`](docker-compose.prod.yml)
- Production environment template: [`.env.production.example`](.env.production.example)
- Nightly PostgreSQL backup script: [`scripts/backup-db.sh`](scripts/backup-db.sh)

### In-Memory Single Instance Limitation
> [!IMPORTANT]
> **Single Instance Constraint**: Eventora's background queues, waitlist promotion sweeps, and Socket.IO rooms operate in-process without an external Redis broker. Horizontal scaling beyond 1 API replica requires an external Redis adapter. Deployment configuration must be set to **exactly 1 instance** (`numInstances: 1`).

### Simulated Sandbox Payment Statement
> [!NOTE]
> **PAYMENT_MODE Invariant**: Eventora operates exclusively with a 100% simulated sandbox payment system (`PAYMENT_MODE=sandbox`). No real monetary transactions, bank accounts, or external payment gateways are touched. All payment flows (card simulation, UPI intent simulation, and payment hold timers) run within a local atomic mock state machine. Live payments are strictly prohibited by production startup guards.

### WhatsApp Notification Provider Note
> [!NOTE]
> **WhatsApp Provider**: `WHATSAPP_PROVIDER` supports `console` (development/testing) and `meta` (official Meta Cloud API) in production. Unofficial scrapers (`baileys`) are strictly prohibited in production and will cause the API server to exit on startup.

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

## 🧪 Verification & Test Suite

The monorepo includes end-to-end integration tests, concurrency race stress tests, and automated accessibility checks.

### Run Verification Gate
```bash
# 1. Typecheck & Monorepo Compilation
pnpm -r typecheck

# 2. Production Build
pnpm -r build

# 3. Unit & Integration Tests (575 tests across workspace)
pnpm -r test

# 4. Playwright Multi-Role E2E Suite (17 tests)
pnpm e2e
```

### Seeded Credentials for Interactive Demo & 5-Role Access
- **Student:** `arjun.mehta@eventora.campus.edu` (`user_student_001`)
- **Organizer:** `priya.patel@eventora.campus.edu` (`user_organizer_001`)
- **Faculty Coordinator:** `dr.sharma@eventora.campus.edu` (`user_faculty_001`)
- **Volunteer Scanner:** `rohit.kumar@eventora.campus.edu` (`user_volunteer_001` / Passkey: `SCAN-123456`)
- **Campus Administrator:** `admin@eventora.campus.edu` (`user_admin_001`)
