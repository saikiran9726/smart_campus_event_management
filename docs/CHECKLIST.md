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
