# Eventora Production Operations Runbook

This operational runbook provides standard operating procedures (SOPs) for maintenance, incident response, secret rotation, and disaster recovery on the **PostgreSQL + Docker Compose + Cloudflare** production stack.

---

## 1. Rollback Procedures

### Frontend Rollback (Cloudflare Pages)
1. Go to **Cloudflare Dashboard > Workers & Pages > eventora-web > Deployments**.
2. Locate the previous healthy deployment SHA.
3. Click the three dots `...` and select **Rollback to this deployment**.
4. Propagation is instant and edge-routed globally within seconds.

### Backend Rollback (Docker Compose)
1. SSH into the server host:
   ```bash
   cd /opt/eventora
   ```
2. Checkout the previous healthy commit or release tag:
   ```bash
   git checkout <PREVIOUS_COMMIT_SHA>
   ```
3. Rebuild and restart the API container with zero downtime for the database:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build --no-deps api
   ```
4. If database schema migration was applied in the bad release:
   - Check if the migration was backward-compatible (all Eventora migrations avoid destructive column drop statements).
   - If manual SQL rollback is needed, run the respective rollback via `psql` inside the container:
     ```bash
     docker exec -it eventora-postgres psql -U eventora -d eventora
     ```
5. Confirm service health:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   node scripts/smoke-prod.mjs https://api.campus.example.com https://campus.example.com
   ```

---

## 2. Secret Rotation Workflows

### A. Rotating `OD_SEAL_SECRET` (Zero-Downtime Verification)
The On-Duty (OD) sanction letter module signs attendance certificates using HMAC-SHA256. 
> [!IMPORTANT]
> If `OD_SEAL_SECRET` is changed without a fallback, all previously issued OD letters will fail verification (`valid: false`) when faculty scan student verification QR codes.

**Zero-Downtime Rotation Procedure**:
1. Copy the current `OD_SEAL_SECRET` value into `OD_SEAL_SECRET_PREVIOUS` in `.env.production`.
2. Generate a new 32+ character random secret for `OD_SEAL_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Update `OD_SEAL_SECRET` in `.env.production`.
4. Recreate the API container:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps api
   ```
5. The server automatically uses `OD_SEAL_SECRET` for all newly issued letters while verifying existing letters against `OD_SEAL_SECRET_PREVIOUS`.
6. After the academic term ends and historical records are archived, `OD_SEAL_SECRET_PREVIOUS` can safely be retired.

### B. Rotating `MAGIC_LINK_SECRET`
Used for cookie encryption and faculty approval magic links.
1. Generate a new 32+ character string.
2. Update `MAGIC_LINK_SECRET` in `.env.production`.
3. Restart the API container:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps api
   ```
4. Note: Any pending faculty review links sent prior to rotation will expire and return `410 OFFER_EXPIRED`. Organizers can re-send approvals from the Organizer Dashboard.

### C. Rotating Clerk Secrets
1. In the Clerk Dashboard, roll API keys in **Configure > API Keys**.
2. Update `CLERK_SECRET_KEY` in `.env.production`.
3. If rotating `CLERK_WEBHOOK_SECRET`, update the signing secret on the Clerk webhook endpoint and simultaneously in `.env.production`.
4. Reload the API service:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps api
   ```

---

## 3. Database Backup & Disaster Recovery

### Automated Nightly Backups
Automated nightly backups are executed via [`scripts/backup-db.sh`](file:///C:/sai%20projects/smartcampus/scripts/backup-db.sh) into `/var/backups/eventora` with 14-day retention.

### Manual Full Database Backup
Execute a manual dump directly from the running `eventora-postgres` container:
```bash
docker exec -t eventora-postgres pg_dump \
  -U eventora \
  -d eventora \
  -F c \
  -b \
  -v > "manual_backup_$(date +%Y%m%d_%H%M%S).dump"
```

### Full Database Restore
To restore into the PostgreSQL container from a backup dump file:
```bash
cat "manual_backup_YYYYMMDD_HHMMSS.dump" | docker exec -i eventora-postgres pg_restore \
  -U eventora \
  -d eventora \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  -v
```

---

## 4. Emergency Incident Procedures

### Emergency Revocation of All Scanner Passkeys
If a security breach or volunteer device compromise occurs, revoke all active volunteer scanning passkeys in one atomic query:
```bash
docker exec -i eventora-postgres psql -U eventora -d eventora -c "
UPDATE scanner_passkeys
SET is_active = false,
    revoked_at = NOW()
WHERE is_active = true;
"
```
*Effect: All volunteer scanners immediately fail gate entry attempts and prompt the volunteer to unlock with a newly issued passkey.*

### Force Expiring Stale Waitlist Offers
To manually trigger the promotion sweep for all expired waitlist claims:
```bash
docker exec -i eventora-postgres psql -U eventora -d eventora -c "
UPDATE registrations
SET status = 'EXPIRED'
WHERE status = 'OFFERED'
  AND offer_expires_at < NOW();
"
```
The in-process expiry worker will pick up and promote the next attendees in queue within 60 seconds.
