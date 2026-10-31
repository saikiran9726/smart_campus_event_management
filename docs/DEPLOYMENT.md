# Eventora Production Deployment Guide

This guide outlines the production deployment architecture and step-by-step procedure for deploying Eventora onto the recommended production stack:
- **Database**: Neon Serverless PostgreSQL
- **Backend API**: Render (Docker Web Service)
- **Frontend Web**: Cloudflare Pages (or Render Static Site)
- **Object Storage**: Cloudflare R2
- **Auth**: Clerk Production
- **Bot Protection**: Cloudflare Turnstile
- **Email Delivery**: Resend

---

## 1. Architecture & Free Tier Gotchas

> [!WARNING]
> **Single Instance Constraint**: Eventora runs background queues, waitlist promotion sweeps, and Socket.IO rooms in-process without an external Redis broker. Set your deployment configuration to **exactly 1 instance** (`numInstances: 1`). Horizontal scaling to >1 replica requires an external Redis adapter.

> [!CAUTION]
> **Free Tier Sleep Invariant**: Free web service tiers on platforms like Render put containers to sleep after 15 minutes of inactivity. When asleep, background workers (such as waitlist 30-minute claim expiry sweeps) pause, and WebSocket connections disconnect. For high-stakes events, use a paid starter instance ($7/mo) or configure an external HTTP pinger (e.g. UptimeRobot or Cron-Job.org) to ping `/health` every 5 minutes.

---

## 2. Recommended Setup Order

To avoid circular dependencies, provision services in this exact order:

1. **Neon PostgreSQL** (yields `DATABASE_URL`)
2. **Cloudflare R2** (yields `R2_*` credentials and public asset URL)
3. **Clerk Production** (yields `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SECRET`)
4. **Cloudflare Turnstile** (yields `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`)
5. **Resend Email** (yields `RESEND_API_KEY`)
6. **Deploy Backend API on Render** (yields production `PUBLIC_API_URL`)
7. **Deploy Frontend on Cloudflare Pages** (yields production `PUBLIC_WEB_URL`)
8. **Finalize Webhook URLs and CORS Origins**

---

## 3. Step-by-Step Provisioning

### Step 1: Neon Serverless PostgreSQL
1. Create a project at [Neon](https://neon.tech).
2. Obtain both the **Pooled connection string** (e.g., `postgresql://...-pooler...`) and the **Direct connection string** (without `-pooler`).
3. **Important Note on Migrations**: Neon connection pooling uses PgBouncer in transaction mode. Because Eventora uses session-level PostgreSQL advisory locks (`pg_advisory_lock`) in `db/migrate.ts` to prevent concurrent migrations, always use the **Direct connection string** for running migrations or when deploying migrations in Docker.
4. Set `DATABASE_SSL=true`.

### Step 2: Cloudflare R2 Object Storage
1. In Cloudflare Dashboard, navigate to **R2** and click **Create bucket**. Name it `eventora-assets`.
2. Go to **Settings > Public access** and enable **Custom Domain** (e.g., `assets.eventora.campus.edu`) or enable the R2 dev domain.
3. In **Settings > CORS Policy**, configure the following JSON:
```json
[
  {
    "AllowedOrigins": [
      "https://eventora.campus.edu",
      "https://eventora-web.pages.dev"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
4. Create an R2 API token with **Object Read & Write** permissions. Note `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.

### Step 3: Clerk Production Instance
1. In the Clerk Dashboard, create a production application.
2. In **Configure > Domains & URLs**, set your production domain and redirect URLs.
3. In **Configure > Webhooks**, click **Add Endpoint**:
   - Endpoint URL: `https://api.eventora.campus.edu/webhooks/clerk`
   - Subscribe to events: `user.created`, `user.updated`, `user.deleted`
4. Copy the **Signing Secret** (starts with `whsec_`) into `CLERK_WEBHOOK_SECRET`.

### Step 4: Cloudflare Turnstile
1. In Cloudflare Dashboard, go to **Turnstile > Add Site**.
2. Domain: Add your production web domain (`eventora.campus.edu` or `*.pages.dev`).
3. Widget Mode: **Managed**.
4. Save `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.

### Step 5: Resend Email
1. In [Resend](https://resend.com), add your campus sending domain and verify DNS records (SPF, DKIM).
2. Generate an API Key starting with `re_` and configure `MAIL_FROM=Eventora <events@eventora.campus.edu>`.

### Step 6: Render (Backend API Service)
1. In [Render](https://render.com), click **New > Blueprint** and link the repository, or create a **Web Service** from `apps/api/Dockerfile`.
2. Configure **Health Check Path**: `/ready`.
3. Set **Number of Instances**: `1`.
4. Supply all required environment variables per the table below.

### Step 7: Cloudflare Pages (Frontend Web App)
1. In Cloudflare Dashboard, go to **Workers & Pages > Create application > Pages > Connect to Git**.
2. Configure build settings:
   - Framework preset: **Vite**
   - Build command: `pnpm install --frozen-lockfile && pnpm --filter @eventora/shared build && pnpm --filter @eventora/web build`
   - Build output directory: `apps/web/dist`
   - Node.js version environment variable: `NODE_VERSION=22`
3. Environment variables:
   - `VITE_API_URL=https://api.eventora.campus.edu`
   - `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...`
   - `VITE_TURNSTILE_SITE_KEY=0x4AAAAAA...`

---

## 4. Production Environment Variables Reference

| Variable Name | Component | Example / Value | Secret? |
|---|---|---|---|
| `NODE_ENV` | API | `production` | No |
| `PORT` | API | `4000` | No |
| `PAYMENT_MODE` | API | `sandbox` (enforced) | No |
| `DATABASE_URL` | API | `postgresql://user:pass@host/db?sslmode=require` | **YES** |
| `DATABASE_SSL` | API | `true` | No |
| `DATABASE_POOL_MAX` | API | `10` | No |
| `CLERK_PUBLISHABLE_KEY` | API & Web | `pk_live_...` | No |
| `CLERK_SECRET_KEY` | API | `sk_live_...` | **YES** |
| `CLERK_WEBHOOK_SECRET` | API | `whsec_...` | **YES** |
| `R2_ACCOUNT_ID` | API | `abc123def456...` | **YES** |
| `R2_ACCESS_KEY_ID` | API | `a1b2c3...` | **YES** |
| `R2_SECRET_ACCESS_KEY` | API | `x9y8z7...` | **YES** |
| `R2_BUCKET` | API | `eventora-assets` | No |
| `R2_PUBLIC_BASE_URL` | API | `https://assets.eventora.campus.edu` | No |
| `TURNSTILE_SECRET_KEY` | API | `0x4AAAAAA...` | **YES** |
| `TURNSTILE_SITE_KEY` | API | `0x4AAAAAA...` | No |
| `VITE_TURNSTILE_SITE_KEY` | Web | `0x4AAAAAA...` | No |
| `EMAIL_PROVIDER` | API | `resend` | No |
| `RESEND_API_KEY` | API | `re_...` | **YES** |
| `MAIL_FROM` | API | `Eventora <events@eventora.campus.edu>` | No |
| `WHATSAPP_PROVIDER` | API | `console` (or `meta`) | No |
| `MAGIC_LINK_SECRET` | API | `>= 32 random characters` | **YES** |
| `OD_SEAL_SECRET` | API | `>= 32 random characters` | **YES** |
| `OD_SEAL_SECRET_PREVIOUS` | API | Previous seal secret during rotation | **YES** |
| `PUBLIC_WEB_URL` | API | `https://eventora.campus.edu` | No |
| `PUBLIC_API_URL` | API | `https://api.eventora.campus.edu` | No |
| `VITE_API_URL` | Web | `https://api.eventora.campus.edu` | No |
| `VITE_CLERK_PUBLISHABLE_KEY` | Web | `pk_live_...` | No |
| `INITIAL_ADMIN_EMAILS` | API | `admin@eventora.campus.edu,dean@campus.edu` | No |
| `ALLOW_DEMO_SEED` | API | `false` | No |

---

## 5. Post-Deployment Smoke Verification

Run the automated smoke test script after deployment:
```bash
node scripts/smoke-prod.mjs https://api.eventora.campus.edu https://eventora.campus.edu
```
Ensure all 10 automated checks report `[PASS]`.
