# Eventora Production Deployment Guide

This guide details the production deployment architecture and step-by-step setup procedure for Eventora on the self-hosted **PostgreSQL 16 + Cloudflare** production stack:
- **Database**: PostgreSQL 16 running via Docker Compose (isolated internal network, persistent named volume, nightly `pg_dump` automation)
- **Backend API**: Node.js 22 container built from [`apps/api/Dockerfile`](file:///C:/sai%20projects/smartcampus/apps/api/Dockerfile) managed by Docker Compose
- **Edge Ingress**: Cloudflare Tunnel (`cloudflared` container) routing `api.campus.example.com` to `http://api:4000` with Zero Trust DDoS protection and automatic TLS
- **Frontend Web**: Cloudflare Pages serving [`apps/web/dist`](file:///C:/sai%20projects/smartcampus/apps/web/dist) at `campus.example.com`
- **Object Storage**: Cloudflare R2 bucket with strict CORS and CDN delivery
- **Auth & Identity**: Clerk Production Instance with webhook integration
- **Bot Protection**: Cloudflare Turnstile (Managed Challenge)
- **Email Delivery**: Resend with custom verified campus domain

---

## 1. Architecture Overview

```
                          ┌───────────────────────────┐
                          │   Cloudflare Edge Network │
                          └─────────────┬─────────────┘
                                        │
           ┌────────────────────────────┴───────────────────────────┐
           │                                                        │
           ▼                                                        ▼
┌─────────────────────────┐                            ┌─────────────────────────┐
│     Cloudflare Pages    │                            │    Cloudflare Tunnel    │
│  (campus.example.com)   │                            │ (api.campus.example.com)│
└─────────────────────────┘                            └────────────┬────────────┘
                                                                    │ Encrypted
                                                                    │ QUIC/HTTP2
                                                                    ▼
                                                       ┌─────────────────────────┐
                                                       │  cloudflared Container  │
                                                       └────────────┬────────────┘
                                                                    │ http://api:4000
                                                                    ▼
                                                       ┌─────────────────────────┐
                                                       │   Eventora API Service  │
                                                       │   (Node 22 / Fastify)   │
                                                       └────────────┬────────────┘
                                                                    │ Internal
                                                                    │ Docker Network
                                                                    ▼
                                                       ┌─────────────────────────┐
                                                       │   PostgreSQL 16 Service │
                                                       │   (Not Exposed to Host) │
                                                       └─────────────────────────┘
```

### Key Architectural Invariants
1. **Zero Open Host Ports**: Neither PostgreSQL nor the API binds public ports on the host. All ingress flows through an outbound Cloudflare Tunnel connection (`cloudflared`).
2. **Single Instance Constraint**: Eventora runs background waitlist sweeps, reminder schedulers, and Socket.IO rooms in-process without an external Redis broker. Docker Compose is strictly configured for 1 replica (`replicas: 1`).
3. **Internal Network Isolation**: PostgreSQL operates solely on the `eventora-internal` Docker bridge network, accessible only by the `api` service.

---

## 2. Recommended Setup Order

To prevent circular dependencies across DNS, webhooks, and CORS:

1. **Cloudflare R2 Bucket**: Create bucket, configure CORS policy, and generate S3-compatible credentials.
2. **Clerk Production**: Create production application, obtain API keys, and prepare webhook endpoints.
3. **Cloudflare Turnstile**: Create production Managed Challenge widget for campus domains.
4. **Resend Email**: Verify domain DNS records (SPF, DKIM, MX) and generate production API key.
5. **Server Host Setup**: Install Docker Engine and Docker Compose on your Linux server host.
6. **Cloudflare Tunnel**: Create a tunnel in the Cloudflare Zero Trust dashboard and obtain `CLOUDFLARE_TUNNEL_TOKEN`.
7. **Deploy Backend Stack (`docker compose -f docker-compose.prod.yml up -d`)**: Boots PostgreSQL, runs migrations, starts the API, and establishes the tunnel.
8. **Deploy Frontend on Cloudflare Pages**: Connect Git repository, set environment variables, and build.
9. **Finalize Webhook & Smoke Verification**: Test Clerk webhooks and run `scripts/smoke-prod.mjs`.

---

## 3. Step-by-Step Provisioning Guide

### Step 1: Cloudflare R2 Object Storage
1. In the Cloudflare Dashboard, go to **R2** > **Create bucket** and name it `eventora-vault-prod`.
2. Navigate to **Settings** > **Public access** and attach a custom domain (e.g., `vault.campus.example.com`) or enable the R2 managed subdomain.
3. Under **Settings** > **CORS Policy**, apply the following configuration:
```json
[
  {
    "AllowedOrigins": [
      "https://campus.example.com",
      "https://*.pages.dev"
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
4. Go to **R2** > **Manage R2 API Tokens**, create a token with **Object Read & Write** permissions scoped to `eventora-vault-prod`, and record `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.

---

### Step 2: Clerk Production Instance
1. In the [Clerk Dashboard](https://dashboard.clerk.com), switch to **Production**.
2. Go to **Configure** > **Domains & URLs** and register your primary domain (`campus.example.com`).
3. Go to **Configure** > **Webhooks** and click **Add Endpoint**:
   - **Endpoint URL**: `https://api.campus.example.com/webhooks/clerk`
   - **Subscribed Events**: `user.created`, `user.updated`, `user.deleted`
4. Copy the **Signing Secret** (`whsec_...`) for `CLERK_WEBHOOK_SECRET`.
5. Copy your production `CLERK_PUBLISHABLE_KEY` (`pk_live_...`) and `CLERK_SECRET_KEY` (`sk_live_...`).

---

### Step 3: Cloudflare Turnstile
1. In the Cloudflare Dashboard, navigate to **Turnstile** > **Add Site**.
2. Set **Domain** to `campus.example.com` (and `*.pages.dev` for staging builds).
3. Set **Widget Mode** to **Managed**.
4. Note your site key (`VITE_TURNSTILE_SITE_KEY`) and secret key (`TURNSTILE_SECRET_KEY`).
   > [!IMPORTANT]
   > Do not use Cloudflare dummy keys (`1x0000...`, `2x0000...`, `3x0000...`). The API server verifies keys on startup and refuses to boot if test keys are detected in production.

---

### Step 4: Resend Email Domain
1. In the [Resend Dashboard](https://resend.com), add your institutional sending domain (e.g., `campus.example.com`).
2. Add the required DNS records (SPF, DKIM, MX) in your DNS provider.
3. Create an API Key (`re_...`) with sending permissions and set `COMM_EMAIL_FROM="Eventora <events@campus.example.com>"`.

---

### Step 5: Server Host Deployment (PostgreSQL + API + Cloudflare Tunnel)

1. Provision a Linux server (Ubuntu 22.04 LTS or Debian 12 recommended) with Docker Engine and Docker Compose installed.
2. Clone the repository and checkout the production tag or branch:
   ```bash
   git clone https://github.com/your-org/eventora.git /opt/eventora
   cd /opt/eventora
   ```
3. Create the production environment file from the template:
   ```bash
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```
4. Populate `.env.production` with your real secrets and domain hostnames. Ensure `DATABASE_URL` matches the internal Docker service address:
   ```env
   DATABASE_URL=postgresql://eventora:<YOUR_PASSWORD>@postgres:5432/eventora
   ```
5. In Cloudflare Zero Trust Dashboard:
   - Navigate to **Networks** > **Tunnels** > **Create Tunnel** (select `Cloudflared`).
   - Copy the tunnel token into `CLOUDFLARE_TUNNEL_TOKEN` in `.env.production`.
   - In the Tunnel configuration, add a **Public Hostname**:
     - **Subdomain**: `api`
     - **Domain**: `campus.example.com`
     - **Service Type**: `HTTP`
     - **URL**: `api:4000`
6. Start the production stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
7. Verify all three containers are healthy:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

---

### Step 6: Automated Nightly PostgreSQL Backups

To ensure disaster recovery without third-party dependencies, schedule the included backup script [`scripts/backup-db.sh`](file:///C:/sai%20projects/smartcampus/scripts/backup-db.sh):

1. Set executable permissions on the backup script:
   ```bash
   chmod +x /opt/eventora/scripts/backup-db.sh
   ```
2. Create a nightly cron job running at 02:00 AM:
   ```bash
   (crontab -l 2>/dev/null; echo "0 2 * * * /opt/eventora/scripts/backup-db.sh >> /var/log/eventora-backup.log 2>&1") | crontab -
   ```
3. Verify backups write to `/var/backups/eventora/` with automated 14-day retention pruning.

---

### Step 7: Cloudflare Pages (Frontend Web Application)

1. In the Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Select your repository and configure the build settings:
   - **Framework preset**: `None` (or `Vite`)
   - **Build command**: `pnpm install --frozen-lockfile && pnpm --filter @eventora/shared build && pnpm --filter @eventora/web build`
   - **Build output directory**: `apps/web/dist`
   - **Root directory**: `/`
3. Add the following **Environment Variables** in the Pages project settings:
   - `NODE_VERSION`: `22`
   - `VITE_API_URL`: `https://api.campus.example.com`
   - `VITE_CLERK_PUBLISHABLE_KEY`: `pk_live_...`
   - `VITE_TURNSTILE_SITE_KEY`: `0x4AAAAAA...`
4. Deploy the site, then navigate to **Custom Domains** and map `campus.example.com`.

---

## 4. Production Environment Variables Reference

| Variable Name | Component | Required / Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | API | `production` | Enforces production runtime guards and strict CORS |
| `PORT` | API | `4000` | Port Fastify binds inside the container |
| `HOST` | API | `0.0.0.0` | Network interface binding for container bridge networking |
| `POSTGRES_USER` | Postgres | `eventora` | PostgreSQL superuser for internal database service |
| `POSTGRES_PASSWORD` | Postgres & API | *Required (Secret)* | Strong database password |
| `POSTGRES_DB` | Postgres | `eventora` | Primary database name |
| `DATABASE_URL` | API | *Required (Secret)* | Internal connection URI: `postgresql://user:pass@postgres:5432/eventora` |
| `DATABASE_SSL` | API | `false` | Disabled for intra-Docker bridge network connection to local Postgres |
| `DATABASE_POOL_MAX` | API | `20` | Maximum connections allocated to `pg.Pool` |
| `PUBLIC_WEB_URL` | API | *Required* (HTTPS) | Web origin allowlisted in CORS (`https://campus.example.com`) |
| `PUBLIC_API_URL` | API | *Required* (HTTPS) | API origin used in generated links (`https://api.campus.example.com`) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel | *Required (Secret)* | Token authenticating `cloudflared` to Cloudflare Zero Trust |
| `CLERK_PUBLISHABLE_KEY` | Web | *Required* | Clerk frontend public key (`pk_live_...`) |
| `CLERK_SECRET_KEY` | API | *Required (Secret)* | Clerk backend secret key (`sk_live_...`) |
| `CLERK_WEBHOOK_SECRET` | API | *Required (Secret)* | Svix HMAC signing secret for webhook verification (`whsec_...`) |
| `TURNSTILE_SECRET_KEY` | API | *Required (Secret)* | Cloudflare Turnstile secret key (production managed challenge) |
| `MAGIC_LINK_SECRET` | API | *Required (Secret)* | Minimum 32-character secret for signing faculty approval tokens |
| `OD_SEAL_SECRET` | API | *Required (Secret)* | Minimum 32-character HMAC secret for signing On-Duty letters |
| `OD_SEAL_SECRET_PREVIOUS` | API | *Optional* | Prior secret preserved during zero-downtime key rotation |
| `PAYMENT_MODE` | API | `sandbox` | Strict invariant: live real-money payments are prohibited |
| `R2_ACCOUNT_ID` | API | *Required (Secret)* | Cloudflare account ID for R2 storage |
| `R2_ACCESS_KEY_ID` | API | *Required (Secret)* | S3-compatible Access Key ID |
| `R2_SECRET_ACCESS_KEY` | API | *Required (Secret)* | S3-compatible Secret Access Key |
| `R2_BUCKET_NAME` | API | `eventora-vault-prod` | Name of R2 bucket storing certificates and resources |
| `R2_PUBLIC_DOMAIN` | API | *Required* (HTTPS) | Public CDN domain serving R2 files (`https://vault.campus.example.com`) |
| `RESEND_API_KEY` | API | *Required (Secret)* | Resend API key for transactional email delivery (`re_...`) |
| `COMM_EMAIL_FROM` | API | *Required* | Sender email format: `"Eventora <events@campus.example.com>"` |
| `WHATSAPP_PROVIDER` | API | `disabled` | Set to `disabled` or `meta` (baileys prohibited in production) |
| `INITIAL_ADMIN_EMAILS` | API | *Required* | Comma-separated admin emails granted the `ADMIN` role upon creation |
| `ADMIN_EMAIL_DOMAIN_ALLOWLIST` | API | *Optional* | Domain suffix restricting administrator account elevation |

---

## 5. Post-Deployment Verification

Execute the automated smoke verification script against your production domains:

```bash
node scripts/smoke-prod.mjs https://api.campus.example.com https://campus.example.com
```

Expected verification output:
```
==========================================================
         EVENTORA PRODUCTION SMOKE VERIFICATION SUITE     
==========================================================
API Target URL: https://api.campus.example.com
Web Target URL: https://campus.example.com
----------------------------------------------------------

[*] Checking API Liveness (/health)... [PASS] (Status 200, status: ok)
[*] Checking API Readiness & DB Connection (/ready)... [PASS] (Status 200, db: up, migrations: applied)
[*] Checking API Version & Commit Info (/version)... [PASS] (Version 0.1.0, commit: 8d50053)
[*] Checking Public Events Endpoint (/events)... [PASS] (Status 200, 20 events returned)
[*] Checking Web Frontend Root Availability (/)... [PASS] (Status 200, HTML document received)
[*] Checking CORS Preflight from https://campus.example.com... [PASS] (access-control-allow-origin: https://campus.example.com)
[*] Checking CORS Isolation from Unauthorized Origin (evil.example)... [PASS] (No allow-origin header granted)
[*] Checking Authentication Guard on Private Endpoint (/me)... [PASS] (Status 401, unauthorized request blocked)
[*] Checking Svix Webhook HMAC Verification (/webhooks/clerk)... [PASS] (Status 400, unsigned webhook payload rejected)
[*] Checking Security Headers / HSTS... [PASS] (API: max-age=15552000; includeSubDomains, Web: max-age=31536000; includeSubDomains; preload)

----------------------------------------------------------
[✓] ALL PRODUCTION SMOKE CHECKS PASSED SUCCESSFULLY.
```
