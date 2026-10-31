# Eventora Production Operations Runbook

This operational runbook provides standard operating procedures (SOPs) for maintenance, incident response, secret rotation, and disaster recovery.

---

## 1. Rollback Procedures

### Frontend Rollback (Cloudflare Pages)
1. Go to **Cloudflare Dashboard > Workers & Pages > eventora-web > Deployments**.
2. Locate the previous healthy deployment SHA.
3. Click the three dots `...` and select **Rollback to this deployment**.
4. Propagation is instant and edge-routed globally within seconds.

### Backend Rollback (Render / Docker)
1. In the **Render Dashboard**, select the `eventora-api` web service.
2. In the **Deploys** tab, click **Revert to previous deploy** or deploy a specific git commit SHA.
3. If database schema migration was applied in the bad release:
   - Check if the migration was backward-compatible (all Eventora migrations avoid destructive drop statements).
   - If manual SQL rollback is needed, run the respective down migration via `psql` before reverting the container.

---

## 2. Secret Rotation Workflows

### A. Rotating `OD_SEAL_SECRET` (Zero-Downtime Verification)
The On-Duty (OD) sanction letter module signs attendance sanction certificates using HMAC-SHA256. 
> [!IMPORTANT]
> If `OD_SEAL_SECRET` is changed without a fallback, all previously issued OD letters will fail verification (`valid: false`) when faculty scan student verification QR codes.

**Zero-Downtime Rotation Procedure**:
1. Copy the current `OD_SEAL_SECRET` value into `OD_SEAL_SECRET_PREVIOUS`.
2. Generate a new 32+ character random secret for `OD_SEAL_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Update environment variables in the host dashboard.
4. The server automatically uses `OD_SEAL_SECRET` for all newly issued letters while verifying existing letters against `OD_SEAL_SECRET_PREVIOUS`.
5. After the academic term ends and historical records are archived, `OD_SEAL_SECRET_PREVIOUS` can safely be retired.

### B. Rotating `MAGIC_LINK_SECRET`
Used for cookie encryption and faculty approval magic links.
1. Generate a new 32+ character string.
2. Update `MAGIC_LINK_SECRET` in environment variables and redeploy.
3. Note: Any pending faculty review links sent prior to rotation will expire and return `410 OFFER_EXPIRED`. Organizers can re-send approvals from the Organizer Dashboard.

### C. Rotating Clerk Secrets
1. In Clerk Dashboard, roll API keys in **API Keys**.
2. Update `CLERK_SECRET_KEY` on Render.
3. If rotating `CLERK_WEBHOOK_SECRET`, update the signing secret on the Clerk webhook endpoint and simultaneously in Render.

---

## 3. Database Backup & Disaster Recovery

### Full Database Backup (PostgreSQL)
Run `pg_dump` with direct connection string:
```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="eventora_backup_$(date +%Y%m%d_%H%M%S).dump"
```

### Full Database Restore
```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname="$DATABASE_URL" \
  "eventora_backup_YYYYMMDD_HHMMSS.dump"
```

---

## 4. Emergency Incident Procedures

### Emergency Revocation of All Scanner Passkeys
If a security breach or volunteer device compromise occurs, revoke all active volunteer scanning passkeys in one atomic query:
```sql
UPDATE scanner_passkeys
SET is_active = false,
    revoked_at = NOW()
WHERE is_active = true;
```
*Effect: All volunteer scanners immediately fail gate entry attempts and prompt the volunteer to unlock with a newly issued passkey.*

### Force Expiring Stale Waitlist Offers
To manually trigger the promotion sweep for all expired waitlist claims:
```sql
UPDATE registrations
SET status = 'EXPIRED'
WHERE status = 'OFFERED'
  AND offer_expires_at < NOW();
```
The in-process expiry worker will pick up and promote the next attendees in queue within 60 seconds.
