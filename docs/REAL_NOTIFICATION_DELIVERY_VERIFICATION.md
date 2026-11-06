# Eventora — Real Notification Delivery Verification Report

**Date:** November 5, 2026
**Target Environment:** Local Isolated Test Environment (`eventora_venue_test`)
**Production Protection Status:** Strictly isolated. Production database (`eventora`) untouched. No real users messaged.

---

## 1. Executive Summary

This report documents the verification of Eventora's real-provider notification delivery readiness for **Email (Resend)** and **WhatsApp (Meta Business Platform Cloud API)**.

In accordance with strict safety protocols:
- Zero credentials, tokens, or phone numbers were exposed in plaintext.
- No live messages were sent to students, organizers, or unauthorized contacts.
- Network paths from the API server to both Resend and Meta Cloud API gateways were probed and verified as reachable.
- Webhook subscription challenges and event handlers were validated.
- Real provider credentials are currently in **safe placeholder/console mode**; required environment variables and provider-side onboarding instructions are detailed below to enable live delivery on demand.

---

## 2. Environment Configuration & Secret Protection Audit

| Component | Target Value | Active Local Setting | Secret Masking / Status |
| :--- | :--- | :--- | :--- |
| **Database** | `eventora_venue_test` | `eventora_venue_test` | **CONFIRMED ISOLATED TEST DB** |
| **Email Provider** | `resend` or `console` | `console` | Safe fallback active |
| **Resend API Key** | `re_...` | `[PLACEHOLDER]` | `re_placeh..._key` (Unset/Mock) |
| **Email Sender (`MAIL_FROM`)** | Verified domain email | `Eventora <events@eventora.campus.edu>` | Unverified campus domain |
| **WhatsApp Provider** | `meta` or `console` | `console` | Safe fallback active |
| **Meta WhatsApp Token** | System user token | `[PLACEHOLDER]` | `placeh...token` (Unset/Mock) |
| **Meta Phone Number ID** | 15-digit Meta ID | `[PLACEHOLDER]` | `***e_id` (Unset/Mock) |
| **Meta API Version** | `v21.0` | `v21.0` | Configured |
| **WhatsApp Webhook Verify Token** | Custom secret string | `eventora_wa_verify_token` | Default test token configured |
| **WhatsApp App Secret** | Meta App Secret | `[NOT_SET]` | Required for production HMAC checks |

---

## 3. Network Gateway Reachability Test

Direct outbound network connectivity from the local development server to both provider gateways was tested:

```
[Local API Server] ───(Outbound HTTPS)───► [api.resend.com]        ==> HTTP 401 Unauthorized (Reachable)
[Local API Server] ───(Outbound HTTPS)───► [graph.facebook.com]   ==> HTTP 400 Bad Request   (Reachable)
```

1. **Resend Gateway (`https://api.resend.com/emails`)**:
   - Endpoint reachable: **Yes**.
   - Gateway response: `HTTP 401 Unauthorized`.
   - Result: Network connection is open and responsive; placeholder authorization was properly rejected by Resend's edge router.
2. **Meta Cloud API Gateway (`https://graph.facebook.com/v21.0`)**:
   - Endpoint reachable: **Yes**.
   - Gateway response: `HTTP 400 Bad Request`.
   - Result: Network connection is open and responsive; placeholder endpoint was reached and returned standard Graph API error payload.

---

## 4. Webhook Subscription & Verification Validation

Eventora mounts dedicated webhook listeners for Meta WhatsApp Cloud API in `apps/api/src/modules/webhooks/whatsapp.ts`.

### A. Webhook Challenge Handshake (`GET /webhooks/whatsapp`)
- **Specification**: Meta sends `GET` with `hub.mode=subscribe`, `hub.verify_token`, and `hub.challenge`.
- **Live Local Test**:
  ```powershell
  Invoke-RestMethod -Uri 'http://127.0.0.1:4000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=eventora_wa_verify_token&hub.challenge=test_challenge_123'
  ```
  - **Output**: `test_challenge_123`
  - **Status Code**: `200 OK` (Content-Type: `text/plain`)
- **Negative Security Test**:
  - Request with mismatched verify token returned `403 Forbidden` (`{"error":"Forbidden: Invalid verification token or subscription mode."}`).

### B. Delivery Status Callback (`POST /webhooks/whatsapp`)
- **Cryptographic Verification**:
  - If `WHATSAPP_APP_SECRET` is set, the endpoint calculates HMAC-SHA256 over raw payload and verifies `X-Hub-Signature-256`.
- **Status Lifecycle Handling**:
  - Distinguishes **API Acceptance** from **Actual Delivery**:
    - **Step 1 (Outbound Send)**: API server sends template -> Meta responds with message ID (`wamid.HBg...`) -> Notification updated to `ACCEPTED`.
    - **Step 2 (Delivery Webhook)**: Meta sends `statuses: [{ id, status: 'delivered' }]` -> Notification updated to `DELIVERED`, records `delivered_at`.
    - **Step 3 (Read Receipt Webhook)**: Meta sends `statuses: [{ id, status: 'read' }]` -> Notification updated to `READ`, records `read_at`.
    - **Step 4 (Failure Callback)**: Meta sends `statuses: [{ id, status: 'failed', errors: [...] }]` -> Notification updated to `FAILED`, stores error reason.

---

## 5. User Consent & Safety Guardrails

Before any notification can be dispatched to a student:
1. **Consent Gate**:
   - Under Indian privacy and Meta Business policies, WhatsApp requires opt-in consent.
   - In `apps/api/src/workers/comms.worker.ts`, `notification_preferences.whatsapp_enabled` must be `true` and have a valid `whatsapp_consent_at` timestamp.
   - Without consent, the notification is cleanly marked `SKIPPED` with `PREFERENCE_WHATSAPP_DISABLED`.
2. **Indian Phone Number Normalization**:
   - Phone numbers must be valid 10-digit Indian numbers starting with `[6-9]`.
   - Missing or non-mobile numbers are marked `SKIPPED` with `NO_PHONE` or `INVALID_INDIAN_PHONE`.
3. **Safety Protection**:
   - Zero unsolicited communications were dispatched to test users or students during this audit.

---

## 6. Real-Provider Onboarding & Configuration Guide

To enable live delivery in production or staging, configure the following credentials:

### A. Resend Email Setup
1. **Create Account & API Key**:
   - Sign up at [resend.com](https://resend.com).
   - Generate an API Key under **API Keys** with "Sending access".
2. **Verify Sending Domain**:
   - Add your campus domain (e.g., `events.yourcampus.edu`) in Resend dashboard.
   - Configure DNS records (DKIM, SPF TXT, MX).
3. **Set Environment Variables**:
   ```env
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_live_xxxxxxxxxxxxxxxxxxxxxxxx
   MAIL_FROM=Eventora <events@events.yourcampus.edu>
   ```

### B. Meta WhatsApp Cloud API Setup
1. **Create Meta App & Business Account**:
   - Log into [developers.facebook.com](https://developers.facebook.com).
   - Create a Business app and add the **WhatsApp** product.
2. **Obtain Credentials**:
   - Obtain a Permanent System User Token with `whatsapp_business_messaging` permission.
   - Copy the **Phone Number ID** from WhatsApp > API Setup.
   - Copy the **App Secret** from App Settings > Basic.
3. **Submit Message Templates for Approval**:
   - In WhatsApp Business Manager > Message Templates, submit the templates:
     - `eventora_booking_confirmed`
     - `eventora_reminder_24h`
     - `eventora_reminder_2h`
     - `eventora_waitlist_offer`
     - `eventora_approval_granted`
     - `eventora_strike_notice`
4. **Configure Webhook in Meta Dashboard**:
   - Callback URL: `https://your-domain.edu/webhooks/whatsapp`
   - Verify Token: Matches `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscriptions: Check `messages` to receive status reports (`delivered`, `read`).
5. **Set Environment Variables**:
   ```env
   WHATSAPP_PROVIDER=meta
   META_WA_TOKEN=EAA...
   META_WA_PHONE_ID=109xxxxxxxxxxxx
   META_WA_API_VERSION=v21.0
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_secure_verify_token
   WHATSAPP_APP_SECRET=your_meta_app_secret
   ```

---

## 7. Controlled Live Smoke Test Procedure

When real credentials have been configured:
1. Provide an authorized test recipient email and test mobile number (+91).
2. Explicit confirmation will be requested before executing one test dispatch.
3. The test runner will:
   - Queue single test notification with `kind: BOOKING_CONFIRMED`.
   - Dispatch to Resend and assert `provider_message_id` is returned.
   - Dispatch to Meta Cloud API and assert `status = 'ACCEPTED'` with `wamid...`.
   - Await or simulate incoming webhook and assert transition to `DELIVERED`.
