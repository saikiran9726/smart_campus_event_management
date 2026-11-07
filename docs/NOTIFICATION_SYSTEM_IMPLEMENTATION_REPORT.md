# EVENTORA — NOTIFICATION, EMAIL DELIVERY & AUTOMATED REMINDER ENGINE IMPLEMENTATION REPORT

**Release:** Eventora OS Campus Engine
**Module:** Communications, Email Delivery, Automated Reminders, & Notification Center
**Database Verified:** `eventora_venue_test` (Zero impact on production `eventora`)
**Test Status:** 25/25 Vitest Tests Passing (100% Green across `comms.test.ts` & `notification-system-complete.test.ts`)
**Build Status:** `@eventora/api` (0 errors) & `@eventora/web` (0 errors, production Vite PWA build)

---

## 1. Executive Summary

This report documents the end-to-end design, implementation, and verification of Eventora's event-driven notification, email delivery, and automated reminder engine. Built as a carrier-grade, idempotent, and resilient subsystem, it ensures that students, club organizers, faculty approvers, volunteers, and platform administrators receive real-time updates and scheduled alerts across email, in-app notification center, and WhatsApp.

---

## 2. Architecture & Transactional Outbox Pattern

### 2.1 Database Schema & Deduplication Constraint
- **Table:** `notifications`
  - `id`: UUID Primary Key (`gen_random_uuid()`)
  - `user_id`: UUID Foreign Key to `users.id` (cascading delete)
  - `event_id`: UUID Foreign Key to `events.id` (set null on delete)
  - `kind`: `notification_kind` Postgres Enum (`BOOKING_CONFIRMED`, `REMINDER_24H`, `REMINDER_2H`, `WAITLIST_OFFER`, `FACULTY_APPROVAL`, `STRIKE_NOTICE`, `REGISTRATION_APPROVED`, `REGISTRATION_REJECTED`, `REGISTRATION_CANCELLED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `TEAM_INVITATION`, `ORGANIZER_ALERT`)
  - `channel`: `notification_channel` Postgres Enum (`EMAIL`, `WHATSAPP`, `IN_APP`)
  - `payload`: `jsonb` containing template metadata, URLs, tokens, and custom messages
  - `status`: Text (`QUEUED`, `SENT`, `FAILED`, `READ`)
  - `attempts`: Integer (defaults to 0, tracks worker retries)
  - `run_at`: Timestamp with time zone (scheduled execution time)
  - `sent_at`: Timestamp with time zone (recorded on successful delivery)
  - `error`: Text (stores last provider error or preference reason)
- **Deduplication:** A unique composite index `notifications_user_event_kind_channel_idx` on `(user_id, event_id, kind, channel)` prevents double-sends and race condition duplication. `enqueue()` leverages `ON CONFLICT DO NOTHING`.

### 2.2 Worker Queue Polling (`FOR UPDATE SKIP LOCKED`)
The worker loop (`processCommsQueueOnce()`) uses PostgreSQL row-level locks with `FOR UPDATE SKIP LOCKED`:
```sql
SELECT id, user_id, event_id, kind, channel, payload, status, attempts, run_at, sent_at, error
FROM notifications
WHERE status = 'QUEUED' AND run_at <= (now() + interval '5 seconds')
ORDER BY run_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 20;
```
This ensures zero lock contention, supports horizontal multi-worker scaling, and prevents duplicate pickup.

---

## 3. Worker Recovery, Exponential Backoff & DLQ

### 3.1 Retry Schedule & Escalation
- **Attempt 1:** Immediate execution. On failure: `run_at` set to `now() + 1 minute`.
- **Attempt 2:** On failure: `run_at` set to `now() + 5 minutes`.
- **Attempt 3 & 4:** On failure: `run_at` set to `now() + 30 minutes`.
- **Attempt 5 (Max Threshold):** Status automatically marked `FAILED`, terminating automated retries and dead-lettering the record for administrator inspection.

### 3.2 Dead-Letter Queue (DLQ) & Admin Re-Drive
- **Admin Endpoint:** `POST /admin/notifications/:id/retry` resets status to `QUEUED`, zeroes `attempts`, schedules `run_at = now()`, and records an immutable audit log entry in `audit_logs`.
- **Admin Metrics Endpoint:** `GET /admin/notifications/stats` computes real-time aggregates (`queued`, `sent`, `failed`, `read`, `dlq`).

---

## 4. Handlebars Email & WhatsApp Templates

All notifications are rendered using compile-cached Handlebars templates with standard HTML escaping for security.

### 4.1 Supported Notification Kinds
1. **`BOOKING_CONFIRMED`:** Ticket registration confirmation, embedded inline ticket QR (`cid:ticket-qr`), venue directions, and attached `.ics` calendar file.
2. **`REMINDER_24H`:** Pre-event alert with gate details, entry guidelines, parking lot instructions, and valid ID rules.
3. **`REMINDER_2H`:** Final countdown reminder with gate numbers, fast-track volunteer check-in notes, and pass access.
4. **`WAITLIST_OFFER`:** Confirmed seat release notification with expiry countdown and one-click claim action.
5. **`FACULTY_APPROVAL`:** Venue booking proposal details sent to faculty approvers with approve/reject CTAs.
6. **`STRIKE_NOTICE`:** Attendance policy compliance strike warning.
7. **`REGISTRATION_APPROVED`:** Organizer decision approval notice with direct link to Campus Passport.
8. **`REGISTRATION_REJECTED`:** Respectful update with organizer's specific rejection reason.
9. **`REGISTRATION_CANCELLED`:** Cancellation confirmation with pass invalidation status.
10. **`PAYMENT_SUCCESS`:** Test sandbox transaction receipt showing amount, payment ID, and confirmation.
11. **`PAYMENT_FAILED`:** Polite decline alert with reason and direct re-attempt link.
12. **`TEAM_INVITATION`:** Invitation notice to join a competition/hackathon team with team code and accept URL.
13. **`ORGANIZER_ALERT`:** Generic broadcast template with fallback support for custom campus announcements.

---

## 5. Calendar (`.ics`) & Gate QR Code Pass Generation

- **Calendar Integration:** Automated generation of RFC 5545 compliant `.ics` calendar attachments via `generateEventIcs()`:
  - Valid `BEGIN:VEVENT` with `UID`, `SUMMARY`, `DESCRIPTION`, `LOCATION`, and `URL`.
  - Two automated `BEGIN:VALARM` triggers: 24 hours prior (`-P1D`) and 2 hours prior (`-PT2H`).
- **Inline Ticket QR:** QR codes are rendered as PNG buffers using `qrcode`, attached as `image/png` with `cid:ticket-qr`, and embedded directly into the confirmation email body without third-party tracking pixels.

---

## 6. Frontend In-App Notification Center

### 6.1 `NotificationBell.tsx` Component
- Embedded in top application shell header (`apps/web/src/components/layout/app-shell.tsx`).
- Live unread badge count with `99+` formatting and animated pill indicator.
- Popover drawer featuring:
  - Filter tabs: **All** and **Unread**.
  - Distinct iconography for approvals, rejections, payments, reminders, and team invitations.
  - Relative time labels ("Just now", "5m ago", "2h ago", "Yesterday").
  - Click-through navigation routing to `/passport` or `/events/:id`.
  - Individual "mark read" on click.
  - Global "Mark all read" button.
  - Settings shortcut opening user preference dialog.

---

## 7. User Notification Preferences System

### 7.1 Database Schema
- **Table:** `notification_preferences`
  - `user_id`: UUID Foreign Key to `users.id` (Unique)
  - `email_enabled`: Boolean (default `true`)
  - `in_app_enabled`: Boolean (default `true`)
  - `whatsapp_enabled`: Boolean (default `false`)
  - `event_reminders`: Boolean (default `true`)
  - `registration_updates`: Boolean (default `true`)
  - `team_updates`: Boolean (default `true`)
  - `announcements`: Boolean (default `true`)
  - `created_at` & `updated_at`: Timestamps

### 7.2 API Routes
- `GET /me/notification-preferences`: Fetches current user preferences (falls back to defaults).
- `PATCH /me/notification-preferences`: Validates and upserts user preference toggles.

### 7.3 Worker Enforcement
Before dispatching any notification, `comms.worker.ts` verifies user preferences:
- If `email_enabled = false` and channel is `EMAIL`, status is marked `SENT` with error `PREFERENCE_EMAIL_DISABLED`.
- If `event_reminders = false` and kind is `REMINDER_24H` or `REMINDER_2H`, reminder is skipped.
- If `announcements = false` and kind is `ORGANIZER_ALERT`, broadcast is skipped.

---

## 8. Automated Reminders & Sweeps Engine

1. **`runRemindersSweepOnce()`:**
   - Evaluates active events starting within 24h (`[23.5h, 24.5h]`) and 2h (`[1.75h, 2.25h]`).
   - Gathers confirmed attendees and enqueues both email and in-app alerts with gate instructions.
2. **`runPendingPaymentRemindersSweepOnce()`:**
   - Sweeps for registrations with `paymentStatus = 'PENDING'` older than 30 minutes for future events.
   - Emits in-app alerts reminding students to complete test payment before seat holds lapse.

---

## 9. Verification & Automated Test Results

### 9.1 Vitest Suites
1. **`apps/api/src/__tests__/comms.test.ts`**: 8 passed
2. **`apps/api/src/__tests__/notification-system-complete.test.ts`**: 17 passed
   - Handlebars templates compile and render for all 13 notification kinds.
   - Idempotency deduplication prevents duplicate queue insertion.
   - Worker recovery, backoff delays, and DLQ exhaustion after 5 attempts.
   - In-app notification creation, listing, read status, and mark-all-read.
   - User notification preferences fetching, updating, and worker suppression.
   - Automated 24h & 2h reminder sweep and pending payment sweep.
   - Test payment success and decline notifications.
   - Admin monitoring metrics endpoint.

**Overall Results: 25 / 25 Tests Passed (100%)**

### 9.2 Typecheck & Build Verifications
- `pnpm --filter @eventora/api typecheck` -> **0 errors**
- `pnpm --filter @eventora/web typecheck` -> **0 errors**
- `pnpm --filter @eventora/web build` -> **0 errors, PWA service worker generated**
