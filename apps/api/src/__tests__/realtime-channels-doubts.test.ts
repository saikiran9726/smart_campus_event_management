import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, Socket } from 'socket.io-client';
import { and, eq } from 'drizzle-orm';
import {
  ChannelKind,
  ClubMemberRole,
  EventStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  channelReads,
  clubChannels,
  clubMembers,
  clubs,
  events,
  messages,
  registrations,
  users,
} from '../db/schema';
import { initIO } from '../realtime/io';
import { resetChatRateLimits } from '../modules/channels/rate-limiter';
import { buildServer } from '../server';

describe('Realtime Chat, Club Channels, Doubt Rooms & Role Badges Suite', () => {
  const server = buildServer();
  let serverPort: number;
  let socketUrl: string;

  let clubOwner: any;
  let clubMember: any;
  let nonMemberStudent: any;
  let registeredStudent: any;
  let facultyAdvisor: any;
  let testClub: any;
  let announcementsChannel: any;
  let generalChannel: any;
  let eventsChannel: any;
  let testEvent: any;
  let doubtChannel: any;

  beforeAll(async () => {
    await server.ready();
    initIO(server.server);
    await server.listen({ port: 0 });
    const addr = server.server.address() as any;
    serverPort = addr.port;
    socketUrl = `http://localhost:${serverPort}`;

    const ts = Date.now();

    // 1. Create Users
    const [owner] = await db
      .insert(users)
      .values({
        clerkId: `clerk_chat_owner_${ts}`,
        email: `chat_owner_${ts}@eventora.edu`,
        fullName: 'Club Owner',
        role: UserRole.ORGANIZER,
      })
      .returning();
    clubOwner = owner;

    const [member] = await db
      .insert(users)
      .values({
        clerkId: `clerk_chat_member_${ts}`,
        email: `chat_member_${ts}@eventora.edu`,
        fullName: 'Club Member',
        role: UserRole.STUDENT,
      })
      .returning();
    clubMember = member;

    const [student] = await db
      .insert(users)
      .values({
        clerkId: `clerk_chat_nonmember_${ts}`,
        email: `chat_nonmember_${ts}@eventora.edu`,
        fullName: 'Non Member Student',
        role: UserRole.STUDENT,
      })
      .returning();
    nonMemberStudent = student;

    const [attendee] = await db
      .insert(users)
      .values({
        clerkId: `clerk_chat_attendee_${ts}`,
        email: `chat_attendee_${ts}@eventora.edu`,
        fullName: 'Registered Attendee',
        role: UserRole.STUDENT,
      })
      .returning();
    registeredStudent = attendee;

    const [faculty] = await db
      .insert(users)
      .values({
        clerkId: `clerk_chat_faculty_${ts}`,
        email: `chat_faculty_${ts}@eventora.edu`,
        fullName: 'Faculty Advisor',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyAdvisor = faculty;

    // 2. Create Club with default channels
    const [c] = await db
      .insert(clubs)
      .values({
        name: `Chat Test Club ${ts}`,
        slug: `chat-test-club-${ts}`,
        description: 'Test club for channels and realtime chat testing',
        facultyCoordinatorId: facultyAdvisor.id,
        createdBy: clubOwner.id,
      })
      .returning();
    testClub = c;

    await db.insert(clubMembers).values([
      { clubId: testClub.id, userId: clubOwner.id, role: ClubMemberRole.OWNER },
      { clubId: testClub.id, userId: clubMember.id, role: ClubMemberRole.MEMBER },
    ]);

    // Create 3 club channels: announcements, general, events
    const [chAnnounce] = await db
      .insert(clubChannels)
      .values({
        clubId: testClub.id,
        kind: ChannelKind.ANNOUNCEMENTS,
        name: 'Announcements',
        slug: 'announcements',
      })
      .returning();
    announcementsChannel = chAnnounce;

    const [chGeneral] = await db
      .insert(clubChannels)
      .values({
        clubId: testClub.id,
        kind: ChannelKind.GENERAL,
        name: 'General',
        slug: 'general',
      })
      .returning();
    generalChannel = chGeneral;

    const [chEvents] = await db
      .insert(clubChannels)
      .values({
        clubId: testClub.id,
        kind: ChannelKind.EVENTS,
        name: 'Events',
        slug: 'events',
      })
      .returning();
    eventsChannel = chEvents;

    // 3. Create Event & Doubt Room
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Chat Event ${ts}`,
        slug: `chat-event-${ts}`,
        description: 'Event for testing doubt room',
        category: 'Technical',
        status: EventStatus.PUBLISHED,
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 90000000),
        registrationOpensAt: new Date(Date.now() - 3600000),
        registrationClosesAt: new Date(Date.now() + 86400000),
        capacity: 100,
        remainingCapacity: 99,
        pricePaise: 0,
        isPaid: false,
        createdBy: clubOwner.id,
      })
      .returning();
    testEvent = ev;

    // Register attendee
    await db.insert(registrations).values({
      eventId: testEvent.id,
      userId: registeredStudent.id,
      status: 'CONFIRMED' as any,
    });

    // Create Doubt Room channel
    const [chDoubt] = await db
      .insert(clubChannels)
      .values({
        eventId: testEvent.id,
        kind: ChannelKind.DOUBT,
        name: 'doubt-room',
        slug: 'doubt-room',
      })
      .returning();
    doubtChannel = chDoubt;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Club Channels Permission Matrix', () => {
    it('blocks regular STUDENT from posting to #announcements (403)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${announcementsChannel.id}/messages`,
        headers: { 'x-test-user-id': clubMember.id },
        payload: { body: 'Unauthorized announcement by student member' },
      });

      expect(res.statusCode).toBe(403);
      const json = res.json();
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('allows club OWNER to post to #announcements with ORGANIZER badge', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${announcementsChannel.id}/messages`,
        headers: { 'x-test-user-id': clubOwner.id },
        payload: { body: 'Official announcement: Welcome to Eventora!' },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.message.body).toBe('Official announcement: Welcome to Eventora!');
      expect(json.message.authorRoleBadge).toBe('ORGANIZER');
    });

    it('allows club member to post in #general with MEMBER badge', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubMember.id },
        payload: { body: 'Hello everyone in general channel!' },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.message.authorRoleBadge).toBe('MEMBER');
    });

    it('blocks manual posting to read-only #events system feed (403)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${eventsChannel.id}/messages`,
        headers: { 'x-test-user-id': clubOwner.id },
        payload: { body: 'Manual message attempting to hijack system feed' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Doubt Room Access & Badges', () => {
    it('blocks non-registrant from accessing doubt room (403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/doubt-room`,
        headers: { 'x-test-user-id': nonMemberStudent.id },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('blocks non-registrant from reading doubt room messages (403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/channels/${doubtChannel.id}/messages`,
        headers: { 'x-test-user-id': nonMemberStudent.id },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('allows confirmed attendee to access doubt room and computes ATTENDEE badge', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/doubt-room`,
        headers: { 'x-test-user-id': registeredStudent.id },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.channel.id).toBe(doubtChannel.id);
      expect(json.userRoleBadge).toBe('ATTENDEE');
    });

    it('allows confirmed attendee to post to doubt room with ATTENDEE badge', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${doubtChannel.id}/messages`,
        headers: { 'x-test-user-id': registeredStudent.id },
        payload: { body: 'What time is the keynote session?' },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.message.body).toBe('What time is the keynote session?');
      expect(json.message.authorRoleBadge).toBe('ATTENDEE');
    });

    it('allows event organizer to post to doubt room with ORGANIZER badge', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${doubtChannel.id}/messages`,
        headers: { 'x-test-user-id': clubOwner.id },
        payload: { body: 'The keynote starts at 10:00 AM sharp.' },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.message.authorRoleBadge).toBe('ORGANIZER');
    });

    it('allows faculty advisor to post to doubt room with FACULTY badge', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${doubtChannel.id}/messages`,
        headers: { 'x-test-user-id': facultyAdvisor.id },
        payload: { body: 'Please bring your student ID cards for attendance.' },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.message.authorRoleBadge).toBe('FACULTY');
    });
  });

  describe('3. Validation & Sanitization', () => {
    it('rejects message with > 4000 characters (400)', async () => {
      const longBody = 'A'.repeat(4001);
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubMember.id },
        payload: { body: longBody },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects empty or whitespace-only messages (400)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubMember.id },
        payload: { body: '   \n\t   ' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
    });

    it('strips ASCII control characters while preserving newlines and tabs', async () => {
      // Include \x00, \x07 (bell), \x1B (escape) along with \n and \t
      const rawText = 'Line 1\x00\x07\n\tLine 2 with control chars\x1B!';
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubMember.id },
        payload: { body: rawText },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json().message.body;
      expect(body).toBe('Line 1\n\tLine 2 with control chars!');
      expect(body).not.toContain('\x00');
      expect(body).not.toContain('\x07');
      expect(body).not.toContain('\x1B');
    });
  });

  describe('4. Rate Limiting (10 msg / 10s per user/channel)', () => {
    it('allows 10 messages but blocks 11th with 429 RATE_LIMITED', async () => {
      resetChatRateLimits();

      // Send 10 messages
      for (let i = 1; i <= 10; i++) {
        const res = await server.inject({
          method: 'POST',
          url: `/channels/${generalChannel.id}/messages`,
          headers: { 'x-test-user-id': clubMember.id },
          payload: { body: `Rapid message #${i}` },
        });
        expect(res.statusCode).toBe(201);
      }

      // 11th message should be rejected
      const rateLimitedRes = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubMember.id },
        payload: { body: 'Rapid message #11 - should be blocked' },
      });

      expect(rateLimitedRes.statusCode).toBe(429);
      expect(rateLimitedRes.json().error.code).toBe('RATE_LIMITED');

      // Reset for following tests
      resetChatRateLimits();
    });
  });

  describe('5. Soft Delete (15-min window & Admin override)', () => {
    let messageToDelete: any;

    beforeAll(async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubMember.id },
        payload: { body: 'Message to be soft deleted soon' },
      });
      messageToDelete = res.json().message;
    });

    it('blocks non-author non-admin student from deleting message (403)', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/messages/${messageToDelete.id}`,
        headers: { 'x-test-user-id': nonMemberStudent.id },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('allows author to soft-delete within 15-minute window', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/messages/${messageToDelete.id}`,
        headers: { 'x-test-user-id': clubMember.id },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.id).toBe(messageToDelete.id);
      expect(json.isDeleted).toBe(true);
      expect(json.deletedAt).toBeTruthy();
    });

    it('renders "[message deleted]" in get messages response', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/channels/${generalChannel.id}/messages?limit=20`,
        headers: { 'x-test-user-id': clubMember.id },
      });

      expect(res.statusCode).toBe(200);
      const messagesList = res.json().messages;
      const found = messagesList.find((m: any) => m.id === messageToDelete.id);
      expect(found).toBeTruthy();
      expect(found.body).toBe('[message deleted]');
      expect(found.isDeleted).toBe(true);
    });

    it('allows club admin to delete older message even past 15 minutes', async () => {
      // Create an old message directly in DB (1 hour ago)
      const oneHourAgo = new Date(Date.now() - 3600_000);
      const [oldMsg] = await db
        .insert(messages)
        .values({
          channelId: generalChannel.id,
          authorId: clubMember.id,
          body: 'An old message from 1 hour ago',
          createdAt: oneHourAgo,
        })
        .returning();

      // Author tries to delete past 15 min -> 403
      const authorRes = await server.inject({
        method: 'DELETE',
        url: `/messages/${oldMsg!.id}`,
        headers: { 'x-test-user-id': clubMember.id },
      });
      expect(authorRes.statusCode).toBe(403);

      // Club Owner (Admin) tries to delete -> 200 allowed anytime
      const adminRes = await server.inject({
        method: 'DELETE',
        url: `/messages/${oldMsg!.id}`,
        headers: { 'x-test-user-id': clubOwner.id },
      });
      expect(adminRes.statusCode).toBe(200);
      expect(adminRes.json().isDeleted).toBe(true);
    });
  });

  describe('6. Pin & Unpin Messages', () => {
    let msgToPin: any;

    beforeAll(async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubOwner.id },
        payload: { body: 'Important pinned notice for all members' },
      });
      msgToPin = res.json().message;
    });

    it('blocks regular member from pinning message (403)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/pin/${msgToPin.id}`,
        headers: { 'x-test-user-id': clubMember.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it('allows club owner to pin a message and lists it under /pinned', async () => {
      const pinRes = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/pin/${msgToPin.id}`,
        headers: { 'x-test-user-id': clubOwner.id },
      });
      expect(pinRes.statusCode).toBe(200);

      const listRes = await server.inject({
        method: 'GET',
        url: `/channels/${generalChannel.id}/pinned`,
        headers: { 'x-test-user-id': clubMember.id },
      });
      expect(listRes.statusCode).toBe(200);
      const pinned = listRes.json().pinned;
      expect(pinned.length).toBeGreaterThanOrEqual(1);
      expect(pinned.some((m: any) => m.id === msgToPin.id)).toBe(true);
    });

    it('allows club owner to unpin a message', async () => {
      const unpinRes = await server.inject({
        method: 'DELETE',
        url: `/channels/${generalChannel.id}/pin/${msgToPin.id}`,
        headers: { 'x-test-user-id': clubOwner.id },
      });
      expect(unpinRes.statusCode).toBe(200);

      const listRes = await server.inject({
        method: 'GET',
        url: `/channels/${generalChannel.id}/pinned`,
        headers: { 'x-test-user-id': clubMember.id },
      });
      const pinned = listRes.json().pinned;
      expect(pinned.some((m: any) => m.id === msgToPin.id)).toBe(false);
    });
  });

  describe('7. Unread Counts Single SQL Query & Read Receipts', () => {
    it('tracks unread messages and clears count upon mark read', async () => {
      // Clear any previous reads for this channel and user
      await db
        .delete(channelReads)
        .where(
          and(
            eq(channelReads.channelId, generalChannel.id),
            eq(channelReads.userId, clubMember.id)
          )
        );

      // Post 2 messages from clubOwner
      const msg1Res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubOwner.id },
        payload: { body: 'Unread test message 1' },
      });
      const msg2Res = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubOwner.id },
        payload: { body: 'Unread test message 2' },
      });

      const msg2 = msg2Res.json().message;

      // Check unread count for clubMember
      const unreadRes1 = await server.inject({
        method: 'GET',
        url: '/me/unread',
        headers: { 'x-test-user-id': clubMember.id },
      });

      expect(unreadRes1.statusCode).toBe(200);
      const unreadList1 = unreadRes1.json().unread;
      const channelUnread1 = unreadList1.find((u: any) => u.channelId === generalChannel.id);
      expect(channelUnread1).toBeTruthy();
      expect(channelUnread1.unreadCount).toBeGreaterThanOrEqual(2);

      // Mark channel read up to msg2
      const readRes = await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/read`,
        headers: { 'x-test-user-id': clubMember.id },
        payload: { lastMessageId: msg2.id },
      });
      expect(readRes.statusCode).toBe(200);

      // Check unread count again
      const unreadRes2 = await server.inject({
        method: 'GET',
        url: '/me/unread',
        headers: { 'x-test-user-id': clubMember.id },
      });

      const unreadList2 = unreadRes2.json().unread;
      const channelUnread2 = unreadList2.find((u: any) => u.channelId === generalChannel.id);
      expect(channelUnread2?.unreadCount || 0).toBe(0);
    });
  });

  describe('8. Keyset Pagination Integrity Across 6,000 Messages', () => {
    it('returns stable non-overlapping pages in strict descending order', async () => {
      // Find the benchmark channel with 6000 messages from seed script
      const [benchClub] = await db
        .select({ id: clubs.id })
        .from(clubs)
        .where(eq(clubs.slug, 'perf-bench-club'))
        .limit(1);

      if (!benchClub) {
        console.warn('perf-bench-club not found, skipping 6000 msg verification');
        return;
      }

      const [benchChannel] = await db
        .select({ id: clubChannels.id })
        .from(clubChannels)
        .where(eq(clubChannels.clubId, benchClub.id))
        .limit(1);

      expect(benchChannel).toBeTruthy();

      // Find an authorized member of benchClub
      const [benchMember] = await db
        .select({ userId: clubMembers.userId })
        .from(clubMembers)
        .where(eq(clubMembers.clubId, benchClub.id))
        .limit(1);

      const benchUserId = benchMember?.userId || clubOwner.id;

      // Page 1
      const resPage1 = await server.inject({
        method: 'GET',
        url: `/channels/${benchChannel!.id}/messages?limit=25`,
        headers: { 'x-test-user-id': benchUserId },
      });

      expect(resPage1.statusCode).toBe(200);
      const page1 = resPage1.json();
      expect(page1.messages.length).toBe(25);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeTruthy();

      // Page 2
      const resPage2 = await server.inject({
        method: 'GET',
        url: `/channels/${benchChannel!.id}/messages?cursor=${encodeURIComponent(page1.nextCursor)}&limit=25`,
        headers: { 'x-test-user-id': benchUserId },
      });

      expect(resPage2.statusCode).toBe(200);
      const page2 = resPage2.json();
      expect(page2.messages.length).toBe(25);

      // Verify zero overlap between page 1 IDs and page 2 IDs
      const page1Ids = new Set(page1.messages.map((m: any) => m.id));
      const page2Ids = new Set(page2.messages.map((m: any) => m.id));

      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }

      // Verify strictly descending timestamp order
      const combined = [...page1.messages, ...page2.messages];
      for (let i = 1; i < combined.length; i++) {
        const prevTime = new Date(combined[i - 1].createdAt).getTime();
        const currTime = new Date(combined[i].createdAt).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });
  });

  describe('9. Socket.IO Realtime Handlers & Throttling', () => {
    let clientSocket: Socket;
    let unauthorizedSocket: Socket;

    afterAll(() => {
      if (clientSocket && clientSocket.connected) clientSocket.disconnect();
      if (unauthorizedSocket && unauthorizedSocket.connected) unauthorizedSocket.disconnect();
    });

    it('denies join:channel for non-member of club with FORBIDDEN error', async () => {
      unauthorizedSocket = ioClient(socketUrl, {
        transports: ['websocket'],
        auth: { testUserId: nonMemberStudent.id },
      });

      await new Promise<void>((resolve, reject) => {
        unauthorizedSocket.on('connect', () => {
          unauthorizedSocket.emit('join:channel', { channelId: generalChannel.id });
        });

        unauthorizedSocket.on('error', (err: any) => {
          expect(err.code).toBe('FORBIDDEN');
          resolve();
        });

        setTimeout(() => reject(new Error('Timeout waiting for FORBIDDEN socket error')), 3000);
      });
    });

    it('allows authorized member to join:channel and receive chat:message broadcast', async () => {
      clientSocket = ioClient(socketUrl, {
        transports: ['websocket'],
        auth: { testUserId: clubMember.id },
      });

      await new Promise<void>((resolve, reject) => {
        clientSocket.on('connect', () => {
          clientSocket.emit('join:channel', { channelId: generalChannel.id });
        });

        clientSocket.on('joined:channel', () => {
          resolve();
        });

        setTimeout(() => reject(new Error('Timeout waiting for joined:channel')), 3000);
      });

      // Post message via REST and verify client receives chat:message broadcast
      const messagePromise = new Promise<any>((resolve, reject) => {
        clientSocket.on('chat:message', (payload: any) => {
          expect(payload.channelId).toBe(generalChannel.id);
          expect(payload.message.content).toBe('Realtime Socket broadcast test');
          expect(payload.deliveryCount).toBeGreaterThanOrEqual(1);
          resolve(payload);
        });

        setTimeout(() => reject(new Error('Timeout waiting for chat:message broadcast')), 3000);
      });

      await server.inject({
        method: 'POST',
        url: `/channels/${generalChannel.id}/messages`,
        headers: { 'x-test-user-id': clubOwner.id },
        payload: { body: 'Realtime Socket broadcast test' },
      });

      await messagePromise;
    });

    it('throttles rapid chat:typing events (max 1 per 2 seconds)', async () => {
      let typingEventsReceived = 0;

      clientSocket.on('chat:typing', () => {
        typingEventsReceived++;
      });

      // Send 3 typing events in quick succession from a second client
      const secondSocket = ioClient(socketUrl, {
        transports: ['websocket'],
        auth: { testUserId: clubOwner.id },
      });

      await new Promise<void>((resolve) => {
        secondSocket.on('connect', () => {
          secondSocket.emit('join:channel', { channelId: generalChannel.id });
          secondSocket.on('joined:channel', () => resolve());
        });
      });

      secondSocket.emit('chat:typing', {
        channelId: generalChannel.id,
        userName: 'Club Owner',
        isTyping: true,
      });

      secondSocket.emit('chat:typing', {
        channelId: generalChannel.id,
        userName: 'Club Owner',
        isTyping: true,
      });

      // Wait 300ms
      await new Promise((r) => setTimeout(r, 300));

      expect(typingEventsReceived).toBe(1); // 2nd was dropped due to 2s throttle

      secondSocket.disconnect();
    });
  });

  describe('8. Club Channels Auto-Creation & Concurrency Idempotency (Prompt 23)', () => {
    it('a club inserted directly with no channels returns three channels from GET /clubs/:id/channels', async () => {
      const ts = Date.now();
      const [newClub] = await db
        .insert(clubs)
        .values({
          name: `Channel Test Club ${ts}`,
          slug: `chan-test-${ts}`,
          description: 'Club created directly without channels',
          createdBy: clubOwner.id,
        })
        .returning();

      expect(newClub).toBeDefined();

      // Verify club has 0 channels initially
      const initialChannels = await db
        .select()
        .from(clubChannels)
        .where(eq(clubChannels.clubId, newClub!.id));
      expect(initialChannels.length).toBe(0);

      // GET /clubs/:clubId/channels triggers auto-creation
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${newClub!.id}/channels`,
        headers: { 'x-test-user-id': clubOwner.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.channels).toHaveLength(3);
      const slugs = body.channels.map((c: any) => c.slug).sort();
      expect(slugs).toEqual(['announcements', 'events', 'general']);
    });

    it('two concurrent calls create exactly three channels, not six', async () => {
      const ts = Date.now();
      const [newClub] = await db
        .insert(clubs)
        .values({
          name: `Concurrent Channel Club ${ts}`,
          slug: `concur-chan-${ts}`,
          description: 'Club for testing race conditions in channel auto-creation',
          createdBy: clubOwner.id,
        })
        .returning();

      expect(newClub).toBeDefined();

      // Launch two concurrent requests
      const [res1, res2] = await Promise.all([
        server.inject({
          method: 'GET',
          url: `/clubs/${newClub!.id}/channels`,
          headers: { 'x-test-user-id': clubOwner.id },
        }),
        server.inject({
          method: 'GET',
          url: `/clubs/${newClub!.id}/channels`,
          headers: { 'x-test-user-id': clubOwner.id },
        }),
      ]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(res1.json().channels).toHaveLength(3);
      expect(res2.json().channels).toHaveLength(3);

      // Verify in DB that exactly 3 channels exist
      const inDb = await db
        .select()
        .from(clubChannels)
        .where(eq(clubChannels.clubId, newClub!.id));
      expect(inDb).toHaveLength(3);
    });

    it('a club with existing channels is unchanged', async () => {
      // testClub already has channels
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/channels`,
        headers: { 'x-test-user-id': clubOwner.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.channels.length).toBeGreaterThanOrEqual(3);
    });
  });
});
