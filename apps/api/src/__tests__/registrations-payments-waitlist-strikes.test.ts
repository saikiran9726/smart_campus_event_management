import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubMembers,
  clubs,
  events,
  ledgerEntries,
  payments,
  registrations,
  tickets,
  users,
} from '../db/schema';
import { signSandboxWebhookPayload } from '../modules/payments/service';
import { buildServer } from '../server';

describe('Registrations, Payments, Waitlist, & Strikes Unit and Route Suite', () => {
  const server = buildServer();

  let organizerUser: any;
  let studentUser: any;
  let testClub: any;
  let standardEvent: any;
  let competitionEvent: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create Users
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_regtest_${ts}`,
        email: `org_regtest_${ts}@campus.edu`,
        fullName: 'Registration Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [std] = await db
      .insert(users)
      .values({
        clerkId: `clerk_std_regtest_${ts}`,
        email: `std_regtest_${ts}@campus.edu`,
        fullName: 'Registration Student',
        rollNumber: `ROLL_REG_${ts}`,
        role: UserRole.STUDENT,
      })
      .returning();
    studentUser = std;

    // 2. Create Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Registration Test Club ${ts}`,
        slug: `reg-test-club-${ts}`,
        description: 'Testing registration edge cases.',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Create standard event
    const now = new Date();
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Standard Open Event ${ts}`,
        slug: `std-open-ev-${ts}`,
        description: 'Open campus event.',
        category: 'Talk',
        startAt: new Date(now.getTime() + 86400000),
        endAt: new Date(now.getTime() + 172800000),
        registrationOpensAt: new Date(now.getTime() - 3600000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 10,
        remainingCapacity: 10,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizerUser.id,
      })
      .returning();
    standardEvent = ev;

    // 4. Create competition event requiring teams
    const [compEv] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Team Hackathon Competition ${ts}`,
        slug: `team-hack-${ts}`,
        description: 'Requires teams of min 2 members.',
        category: 'Hackathon',
        startAt: new Date(now.getTime() + 86400000),
        endAt: new Date(now.getTime() + 172800000),
        registrationOpensAt: new Date(now.getTime() - 3600000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        pricePaise: 0,
        isPaid: false,
        isCompetition: true,
        minTeamSize: 2,
        maxTeamSize: 4,
        createdBy: organizerUser.id,
      })
      .returning();
    competitionEvent = compEv;
  });

  afterAll(async () => {
    await server.close();
  });

  it('rejects solo registration on competition events that require team flow', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/events/${competitionEvent.id}/registrations`,
      headers: {
        'x-test-user-id': studentUser.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {} },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('VALIDATION_FAILED');
    expect(json.error.message).toContain('requires team registration');
  });

  it('successful registration followed by duplicate attempt returns 409 CONFLICT', async () => {
    // First registration succeeds
    const res1 = await server.inject({
      method: 'POST',
      url: `/events/${standardEvent.id}/registrations`,
      headers: {
        'x-test-user-id': studentUser.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {} },
    });
    expect(res1.statusCode).toBe(201);
    const json1 = JSON.parse(res1.body);
    expect(json1.outcome).toBe('CONFIRMED');

    // Duplicate attempt returns 409 CONFLICT
    const res2 = await server.inject({
      method: 'POST',
      url: `/events/${standardEvent.id}/registrations`,
      headers: {
        'x-test-user-id': studentUser.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {} },
    });
    expect(res2.statusCode).toBe(409);
    const json2 = JSON.parse(res2.body);
    expect(json2.error.code).toBe('CONFLICT');
  });

  it('GET /me/registrations returns participant registrations joined with event info', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/me/registrations',
      headers: { 'x-test-user-id': studentUser.id },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.items).toBeInstanceOf(Array);
    expect(json.items.length).toBeGreaterThanOrEqual(1);

    const first = json.items[0];
    expect(first.registration.eventId).toBe(standardEvent.id);
    expect(first.event.title).toBe(standardEvent.title);
    expect(first.ticket).toBeDefined();
  });

  it('GET /events/:id/waitlist/me returns live waitlist position when waitlisted', async () => {
    const ts = Date.now();

    // Create 0 capacity event
    const [fullEvent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Full Event ${ts}`,
        slug: `full-ev-${ts}`,
        description: 'Sold out event.',
        category: 'Talk',
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 172800000),
        registrationOpensAt: new Date(Date.now() - 3600000),
        registrationClosesAt: new Date(Date.now() + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 1,
        remainingCapacity: 0, // 0 remaining
        pricePaise: 0,
        isPaid: false,
        createdBy: organizerUser.id,
      })
      .returning();

    // Register user -> joins waitlist at position 1
    const regRes = await server.inject({
      method: 'POST',
      url: `/events/${fullEvent!.id}/registrations`,
      headers: {
        'x-test-user-id': studentUser.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {} },
    });
    expect(regRes.statusCode).toBe(200);
    expect(JSON.parse(regRes.body).outcome).toBe('WAITLISTED');

    // Query live waitlist position
    const wlRes = await server.inject({
      method: 'GET',
      url: `/events/${fullEvent!.id}/waitlist/me`,
      headers: { 'x-test-user-id': studentUser.id },
    });

    expect(wlRes.statusCode).toBe(200);
    const wlJson = JSON.parse(wlRes.body);
    expect(wlJson.waitlisted).toBe(true);
    expect(wlJson.position).toBe(1);
  });

  it('calling cancel on an already cancelled registration is a clean no-op', async () => {
    // Fetch student's registration
    const [reg] = await db
      .select()
      .from(registrations)
      .where(
        eq(registrations.eventId, standardEvent.id)
      );
    expect(reg).toBeDefined();

    // First cancel
    const cancel1 = await server.inject({
      method: 'POST',
      url: `/registrations/${reg!.id}/cancel`,
      headers: { 'x-test-user-id': studentUser.id },
    });
    expect(cancel1.statusCode).toBe(200);

    // Second cancel is a safe no-op
    const cancel2 = await server.inject({
      method: 'POST',
      url: `/registrations/${reg!.id}/cancel`,
      headers: { 'x-test-user-id': studentUser.id },
    });
    expect(cancel2.statusCode).toBe(200);
    const json = JSON.parse(cancel2.body);
    expect(json.success).toBe(true);
    expect(json.message).toContain('already cancelled');
  });

  it('POST /webhooks/sandbox processes signed payment notification', async () => {
    const ts = Date.now();

    // Create a paid event & registration
    const [paidEv] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Webhook Test Event ${ts}`,
        slug: `webhook-ev-${ts}`,
        description: 'Testing webhook simulation.',
        category: 'Talk',
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 172800000),
        registrationOpensAt: new Date(Date.now() - 3600000),
        registrationClosesAt: new Date(Date.now() + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 10,
        remainingCapacity: 10,
        pricePaise: 29900,
        isPaid: true,
        createdBy: organizerUser.id,
      })
      .returning();

    const [paidReg] = await db
      .insert(registrations)
      .values({
        eventId: paidEv!.id,
        userId: studentUser.id,
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PENDING,
        amountPaise: 29900,
      })
      .returning();

    const [pmt] = await db
      .insert(payments)
      .values({
        registrationId: paidReg!.id,
        provider: 'SANDBOX',
        providerRef: `sbx_wh_${ts}`,
        amountPaise: 29900,
        status: PaymentStatus.PENDING,
      })
      .returning();

    const payload = JSON.stringify({
      paymentId: pmt!.id,
      simulate: 'SUCCESS',
    });

    const signature = signSandboxWebhookPayload(payload);

    const whRes = await server.inject({
      method: 'POST',
      url: '/webhooks/sandbox',
      headers: {
        'content-type': 'application/json',
        'x-sandbox-signature': signature,
      },
      payload,
    });

    expect(whRes.statusCode).toBe(200);
    const json = JSON.parse(whRes.body);
    expect(json.outcome).toBe('SUCCEEDED');
    expect(json.ticket).toBeDefined();

    // Regression Test: Calling webhook a 2nd time must be idempotent and NOT duplicate ledger rows or tickets
    const duplicateRes = await server.inject({
      method: 'POST',
      url: '/webhooks/sandbox',
      headers: {
        'content-type': 'application/json',
        'x-sandbox-signature': signature,
      },
      payload,
    });
    expect(duplicateRes.statusCode).toBe(200);
    const dupJson = JSON.parse(duplicateRes.body);
    expect(dupJson.outcome).toBe('SUCCEEDED');

    const ledgers = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.paymentId, pmt!.id));
    expect(ledgers.length).toBe(1);

    const issuedTickets = await db
      .select()
      .from(tickets)
      .where(eq(tickets.registrationId, paidReg!.id));
    expect(issuedTickets.length).toBe(1);

    // Replay with simulate: 'FAILURE' on an already SUCCEEDED payment must NOT flip or cancel
    const replayPayload = JSON.stringify({
      paymentId: pmt!.id,
      simulate: 'FAILURE',
    });
    const replaySig = signSandboxWebhookPayload(replayPayload);
    const replayRes = await server.inject({
      method: 'POST',
      url: '/webhooks/sandbox',
      headers: {
        'content-type': 'application/json',
        'x-sandbox-signature': replaySig,
      },
      payload: replayPayload,
    });
    expect(replayRes.statusCode).toBe(200);
    const replayJson = JSON.parse(replayRes.body);
    expect(replayJson.outcome).toBe('SUCCEEDED'); // Remains SUCCEEDED
  });

  it('POST /webhooks/sandbox rejects unsigned or invalidly signed webhooks (403)', async () => {
    // Missing signature
    const unRes = await server.inject({
      method: 'POST',
      url: '/webhooks/sandbox',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ paymentId: 'dummy-id', simulate: 'SUCCESS' }),
    });
    expect(unRes.statusCode).toBe(403);

    // Invalid signature
    const badRes = await server.inject({
      method: 'POST',
      url: '/webhooks/sandbox',
      headers: {
        'content-type': 'application/json',
        'x-sandbox-signature': 'invalid_signature_hex_value',
      },
      payload: JSON.stringify({ paymentId: 'dummy-id', simulate: 'SUCCESS' }),
    });
    expect(badRes.statusCode).toBe(403);
  });
});
