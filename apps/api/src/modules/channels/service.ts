import { and, desc, eq, sql } from 'drizzle-orm';
import {
  ChannelKind,
  ClubMemberRole,
  UserRole,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  certificates,
  channelReads,
  clubChannels,
  clubMembers,
  clubs,
  events,
  messages,
  registrations,
  scannerPasskeys,
  scannerSessions,
  users,
  winners,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { getIO } from '../../realtime/io';
import { consumeMessageToken } from './rate-limiter';

/**
 * Strips ASCII control characters from message text, preserving newlines, carriage returns, and tabs.
 */
export function stripControlCharacters(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export interface ChannelAccessResult {
  allowed: boolean;
  roleBadge: string | null;
  reason?: string;
  isOrganizerOrAdmin: boolean;
}

/**
 * Verifies read access for a user to a specific channel.
 */
export async function checkChannelReadAccess(
  channelId: string,
  userId: string
): Promise<boolean> {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return false;
  if (user.role === UserRole.ADMIN || user.role === UserRole.FACULTY) return true;

  const [channel] = await db
    .select({
      id: clubChannels.id,
      clubId: clubChannels.clubId,
      eventId: clubChannels.eventId,
      kind: clubChannels.kind,
    })
    .from(clubChannels)
    .where(eq(clubChannels.id, channelId))
    .limit(1);

  if (!channel) return false;

  // Club channel access
  if (channel.clubId) {
    // Check if faculty coordinator of this club
    const [club] = await db
      .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
      .from(clubs)
      .where(eq(clubs.id, channel.clubId))
      .limit(1);

    if (club?.facultyCoordinatorId === userId) return true;

    const [membership] = await db
      .select({ role: clubMembers.role })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, channel.clubId),
          eq(clubMembers.userId, userId)
        )
      )
      .limit(1);

    return Boolean(membership);
  }

  // Event doubt room access
  if (channel.eventId) {
    return checkEventChannelAccess(channel.eventId, userId, user.role);
  }

  return false;
}

/**
 * Checks if a user has access to an event doubt room.
 */
async function checkEventChannelAccess(
  eventId: string,
  userId: string,
  userRole?: string
): Promise<boolean> {
  if (userRole === UserRole.ADMIN) return true;

  // 1. Confirmed attendee
  const [registration] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.userId, userId),
        eq(registrations.status, 'CONFIRMED' as any)
      )
    )
    .limit(1);

  if (registration) return true;

  // 2. Event organizer or club owner/admin
  const [event] = await db
    .select({
      id: events.id,
      clubId: events.clubId,
      createdBy: events.createdBy,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) return false;
  if (event.createdBy === userId) return true;

  if (event.clubId) {
    const [club] = await db
      .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
      .from(clubs)
      .where(eq(clubs.id, event.clubId))
      .limit(1);

    if (club?.facultyCoordinatorId === userId) return true;

    const [membership] = await db
      .select({ role: clubMembers.role })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, event.clubId),
          eq(clubMembers.userId, userId)
        )
      )
      .limit(1);

    if (membership && (membership.role === ClubMemberRole.OWNER || membership.role === ClubMemberRole.ADMIN)) {
      return true;
    }
  }

  // 3. Active volunteer with scanner session
  const [volunteerSession] = await db
    .select({ id: scannerSessions.id })
    .from(scannerSessions)
    .innerJoin(scannerPasskeys, eq(scannerSessions.passkeyId, scannerPasskeys.id))
    .where(
      and(
        eq(scannerPasskeys.eventId, eventId),
        eq(scannerSessions.userId, userId)
      )
    )
    .limit(1);

  if (volunteerSession) return true;

  return false;
}

/**
 * Checks posting permission and computes author role badge for a channel.
 */
export async function checkChannelPostAccess(
  channelId: string,
  userId: string
): Promise<ChannelAccessResult> {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { allowed: false, roleBadge: null, isOrganizerOrAdmin: false, reason: 'User not found' };
  }

  const [channel] = await db
    .select({
      id: clubChannels.id,
      clubId: clubChannels.clubId,
      eventId: clubChannels.eventId,
      kind: clubChannels.kind,
      slug: clubChannels.slug,
    })
    .from(clubChannels)
    .where(eq(clubChannels.id, channelId))
    .limit(1);

  if (!channel) {
    return { allowed: false, roleBadge: null, isOrganizerOrAdmin: false, reason: 'Channel not found' };
  }

  // System admin has full organizer access
  if (user.role === UserRole.ADMIN) {
    if (channel.kind === ChannelKind.EVENTS) {
      return { allowed: false, roleBadge: null, isOrganizerOrAdmin: true, reason: 'Events channel is a read-only system feed' };
    }
    return { allowed: true, roleBadge: 'ORGANIZER', isOrganizerOrAdmin: true };
  }

  // 1. Club Channels (#announcements, #general, #events)
  if (channel.clubId) {
    const [membership] = await db
      .select({ role: clubMembers.role })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, channel.clubId),
          eq(clubMembers.userId, userId)
        )
      )
      .limit(1);

    if (!membership) {
      return { allowed: false, roleBadge: null, isOrganizerOrAdmin: false, reason: 'Not a member of this club' };
    }

    const isClubAdmin = membership.role === ClubMemberRole.OWNER || membership.role === ClubMemberRole.ADMIN;

    if (channel.kind === ChannelKind.EVENTS) {
      return {
        allowed: false,
        roleBadge: null,
        isOrganizerOrAdmin: isClubAdmin,
        reason: 'The #events channel is a read-only system feed',
      };
    }

    if (channel.kind === ChannelKind.ANNOUNCEMENTS) {
      if (!isClubAdmin) {
        return {
          allowed: false,
          roleBadge: null,
          isOrganizerOrAdmin: false,
          reason: 'Only club owners and admins can post in #announcements',
        };
      }
      return { allowed: true, roleBadge: 'ORGANIZER', isOrganizerOrAdmin: true };
    }

    // ChannelKind.GENERAL
    return {
      allowed: true,
      roleBadge: isClubAdmin ? 'ORGANIZER' : 'MEMBER',
      isOrganizerOrAdmin: isClubAdmin,
    };
  }

  // 2. Event Doubt Room
  if (channel.eventId) {
    const eventId = channel.eventId;

    // Check organizer status
    const [event] = await db
      .select({
        id: events.id,
        clubId: events.clubId,
        createdBy: events.createdBy,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    let isOrganizer = Boolean(event && event.createdBy === userId);
    let isFaculty = user.role === UserRole.FACULTY;

    if (event?.clubId) {
      const [club] = await db
        .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
        .from(clubs)
        .where(eq(clubs.id, event.clubId))
        .limit(1);

      if (club?.facultyCoordinatorId === userId) {
        isFaculty = true;
      }

      const [membership] = await db
        .select({ role: clubMembers.role })
        .from(clubMembers)
        .where(
          and(
            eq(clubMembers.clubId, event.clubId),
            eq(clubMembers.userId, userId)
          )
        )
        .limit(1);

      if (membership && (membership.role === ClubMemberRole.OWNER || membership.role === ClubMemberRole.ADMIN)) {
        isOrganizer = true;
      }
    }

    if (isOrganizer) {
      return { allowed: true, roleBadge: 'ORGANIZER', isOrganizerOrAdmin: true };
    }

    if (isFaculty) {
      return { allowed: true, roleBadge: 'FACULTY', isOrganizerOrAdmin: true };
    }

    // Active volunteer
    const [volunteer] = await db
      .select({ id: scannerSessions.id })
      .from(scannerSessions)
      .innerJoin(scannerPasskeys, eq(scannerSessions.passkeyId, scannerPasskeys.id))
      .where(
        and(
          eq(scannerPasskeys.eventId, eventId),
          eq(scannerSessions.userId, userId)
        )
      )
      .limit(1);

    if (volunteer) {
      return { allowed: true, roleBadge: 'VOLUNTEER', isOrganizerOrAdmin: false };
    }

    // Winner check
    const [cert] = await db
      .select({ id: certificates.id })
      .from(certificates)
      .where(
        and(
          eq(certificates.eventId, eventId),
          eq(certificates.userId, userId),
          eq(certificates.kind, 'WINNER')
        )
      )
      .limit(1);

    if (cert) {
      return { allowed: true, roleBadge: 'WINNER', isOrganizerOrAdmin: false };
    }

    // Confirmed attendee
    const [registration] = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, eventId),
          eq(registrations.userId, userId),
          eq(registrations.status, 'CONFIRMED' as any)
        )
      )
      .limit(1);

    if (registration) {
      return { allowed: true, roleBadge: 'ATTENDEE', isOrganizerOrAdmin: false };
    }

    return {
      allowed: false,
      roleBadge: null,
      isOrganizerOrAdmin: false,
      reason: 'Only confirmed attendees, organizers, and faculty can participate in this doubt room',
    };
  }

  return { allowed: false, roleBadge: null, isOrganizerOrAdmin: false, reason: 'Invalid channel parent' };
}

/**
 * Posts a message to a channel with rate limiting, permission checks, and real-time broadcast.
 */
export async function postMessageToChannel(
  channelId: string,
  userId: string,
  rawBody: string,
  replyToId?: string
) {
  // 1. Sanitize text and strip control characters
  const sanitized = stripControlCharacters(rawBody).trim();
  if (!sanitized || sanitized.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'Message body cannot be empty.', 400);
  }
  if (sanitized.length > 4000) {
    throw new AppError('VALIDATION_FAILED', 'Message body must not exceed 4000 characters.', 400);
  }

  // 2. In-memory token bucket rate limiting (10 msg / 10s per user/channel)
  const allowedByRateLimit = consumeMessageToken(channelId, userId);
  if (!allowedByRateLimit) {
    throw new AppError(
      'RATE_LIMITED',
      'Too many messages. Maximum 10 messages per 10 seconds.',
      429
    );
  }

  // 3. Permission and badge computation
  const access = await checkChannelPostAccess(channelId, userId);
  if (!access.allowed) {
    throw new AppError('FORBIDDEN', access.reason || 'Permission denied.', 403);
  }

  // 4. If replyToId provided, verify it belongs to this channel
  if (replyToId) {
    const [replyMsg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, replyToId), eq(messages.channelId, channelId)))
      .limit(1);

    if (!replyMsg) {
      throw new AppError('NOT_FOUND', 'Reply-to message not found in this channel.', 404);
    }
  }

  // 5. Insert message
  const [inserted] = await db
    .insert(messages)
    .values({
      channelId,
      authorId: userId,
      body: sanitized,
      replyToId: replyToId || null,
      authorRoleBadge: access.roleBadge,
    })
    .returning();

  if (!inserted) {
    throw new AppError('CONFLICT', 'Failed to insert message.', 409);
  }

  // Load user name for broadcasting
  const [user] = await db
    .select({ fullName: users.fullName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const formattedMessage = {
    id: inserted.id,
    channelId: inserted.channelId,
    authorId: inserted.authorId,
    authorName: user?.fullName || 'User',
    authorEmail: user?.email || '',
    body: inserted.body,
    replyToId: inserted.replyToId,
    pinnedAt: inserted.pinnedAt,
    authorRoleBadge: inserted.authorRoleBadge,
    deletedAt: inserted.deletedAt,
    createdAt: inserted.createdAt,
    isDeleted: false,
  };

  // 6. Broadcast over Socket.IO to room `channel:${channelId}` with delivery count
  try {
    const io = getIO();
    const roomName = `channel:${channelId}`;
    const sockets = await io.in(roomName).allSockets();
    const deliveryCount = sockets ? sockets.size : 0;

    io.to(roomName).emit('chat:message', {
      channelId,
      message: {
        id: formattedMessage.id,
        channelId: formattedMessage.channelId,
        senderId: formattedMessage.authorId,
        senderName: formattedMessage.authorName,
        content: formattedMessage.body,
        isPinned: Boolean(formattedMessage.pinnedAt),
        createdAt: formattedMessage.createdAt.toISOString(),
      },
      ...({ deliveryCount } as any),
    } as any);
  } catch {
    // Sockets may not be active
  }

  return formattedMessage;
}

/**
 * Keyset pagination for messages in a channel: ordered by `(created_at, id)` descending.
 * Sub-50ms performance index scan on composite index `(channel_id, created_at DESC, id DESC)`.
 */
export async function getChannelMessages(
  channelId: string,
  userId: string,
  cursor?: string,
  limit = 50
) {
  // Verify user has read access
  const hasAccess = await checkChannelReadAccess(channelId, userId);
  if (!hasAccess) {
    throw new AppError('FORBIDDEN', 'You do not have access to read this channel.', 403);
  }

  const queryLimit = Math.min(Math.max(1, limit), 100);

  let cursorCreatedAt: Date | null = null;
  let cursorId: string | null = null;

  if (cursor) {
    const separatorIdx = cursor.lastIndexOf('_');
    if (separatorIdx !== -1) {
      const dateStr = cursor.slice(0, separatorIdx);
      const idStr = cursor.slice(separatorIdx + 1);
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime()) && idStr) {
        cursorCreatedAt = parsedDate;
        cursorId = idStr;
      }
    }
  }

  // Tuple condition using raw SQL with parameters for maximal planner optimization
  let rows: Array<{
    id: string;
    channelId: string;
    authorId: string;
    body: string;
    replyToId: string | null;
    pinnedAt: Date | null;
    authorRoleBadge: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    authorName: string;
    authorEmail: string;
  }>;

  if (cursorCreatedAt && cursorId) {
    const result = await db.execute(sql`
      SELECT 
        m.id,
        m.channel_id AS "channelId",
        m.author_id AS "authorId",
        m.body,
        m.reply_to_id AS "replyToId",
        m.pinned_at AS "pinnedAt",
        m.author_role_badge AS "authorRoleBadge",
        m.deleted_at AS "deletedAt",
        m.created_at AS "createdAt",
        u.full_name AS "authorName",
        u.email AS "authorEmail"
      FROM messages m
      JOIN users u ON m.author_id = u.id
      WHERE m.channel_id = ${channelId}::uuid
        AND (m.created_at, m.id) < (${cursorCreatedAt.toISOString()}::timestamptz, ${cursorId}::uuid)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${queryLimit + 1}
    `);
    rows = result.rows as any[];
  } else {
    const result = await db.execute(sql`
      SELECT 
        m.id,
        m.channel_id AS "channelId",
        m.author_id AS "authorId",
        m.body,
        m.reply_to_id AS "replyToId",
        m.pinned_at AS "pinnedAt",
        m.author_role_badge AS "authorRoleBadge",
        m.deleted_at AS "deletedAt",
        m.created_at AS "createdAt",
        u.full_name AS "authorName",
        u.email AS "authorEmail"
      FROM messages m
      JOIN users u ON m.author_id = u.id
      WHERE m.channel_id = ${channelId}::uuid
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${queryLimit + 1}
    `);
    rows = result.rows as any[];
  }

  const hasMore = rows.length > queryLimit;
  const items = hasMore ? rows.slice(0, queryLimit) : rows;

  const formattedMessages = items.map((msg) => {
    const isDeleted = Boolean(msg.deletedAt);
    return {
      id: msg.id,
      channelId: msg.channelId,
      authorId: msg.authorId,
      authorName: msg.authorName,
      authorEmail: msg.authorEmail,
      body: isDeleted ? '[message deleted]' : msg.body,
      replyToId: msg.replyToId,
      pinnedAt: msg.pinnedAt ? new Date(msg.pinnedAt) : null,
      authorRoleBadge: msg.authorRoleBadge,
      deletedAt: msg.deletedAt ? new Date(msg.deletedAt) : null,
      createdAt: new Date(msg.createdAt),
      isDeleted,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    if (last) {
      nextCursor = `${new Date(last.createdAt).toISOString()}_${last.id}`;
    }
  }

  return {
    messages: formattedMessages,
    nextCursor,
    hasMore,
  };
}

/**
 * Pins or unpins a message. Only club/event organizers or admins are permitted.
 */
export async function pinMessage(
  channelId: string,
  messageId: string,
  userId: string,
  isPinned: boolean
) {
  const access = await checkChannelPostAccess(channelId, userId);
  if (!access.isOrganizerOrAdmin) {
    throw new AppError('FORBIDDEN', 'Only organizers and administrators can pin messages.', 403);
  }

  const [message] = await db
    .select({ id: messages.id, channelId: messages.channelId })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
    .limit(1);

  if (!message) {
    throw new AppError('NOT_FOUND', 'Message not found in this channel.', 404);
  }

  const [updated] = await db
    .update(messages)
    .set({
      pinnedAt: isPinned ? new Date() : null,
    })
    .where(eq(messages.id, messageId))
    .returning();

  try {
    const io = getIO();
    io.to(`channel:${channelId}`).emit('chat:pinned', {
      channelId,
      messageId,
      isPinned,
    });
  } catch {
    // Sockets may not be active
  }

  return updated;
}

/**
 * Lists all pinned messages in a channel.
 */
export async function getPinnedMessages(channelId: string, userId: string) {
  const hasAccess = await checkChannelReadAccess(channelId, userId);
  if (!hasAccess) {
    throw new AppError('FORBIDDEN', 'You do not have access to this channel.', 403);
  }

  const pinned = await db
    .select({
      id: messages.id,
      channelId: messages.channelId,
      authorId: messages.authorId,
      body: messages.body,
      replyToId: messages.replyToId,
      pinnedAt: messages.pinnedAt,
      authorRoleBadge: messages.authorRoleBadge,
      deletedAt: messages.deletedAt,
      createdAt: messages.createdAt,
      authorName: users.fullName,
      authorEmail: users.email,
    })
    .from(messages)
    .innerJoin(users, eq(messages.authorId, users.id))
    .where(
      and(
        eq(messages.channelId, channelId),
        sql`${messages.pinnedAt} IS NOT NULL`
      )
    )
    .orderBy(desc(messages.pinnedAt));

  return pinned.map((msg) => ({
    ...msg,
    body: msg.deletedAt ? '[message deleted]' : msg.body,
    isDeleted: Boolean(msg.deletedAt),
  }));
}

/**
 * Records a read receipt for a user up to a given message.
 */
export async function markChannelRead(
  channelId: string,
  userId: string,
  lastMessageId: string
) {
  await db
    .insert(channelReads)
    .values({
      channelId,
      userId,
      lastReadMessageId: lastMessageId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [channelReads.channelId, channelReads.userId],
      set: {
        lastReadMessageId: lastMessageId,
        updatedAt: new Date(),
      },
    });

  try {
    const io = getIO();
    io.to(`channel:${channelId}`).emit('chat:read', {
      channelId,
      userId,
      lastReadMessageId: lastMessageId,
    });
  } catch {
    // Ignore
  }

  return { success: true };
}

/**
 * Single SQL query returning unread message count across all accessible channels.
 */
export async function getUnreadCountsForUser(userId: string) {
  const result = await db.execute(sql`
    WITH user_channels AS (
      -- Club channels user belongs to
      SELECT c.id AS channel_id
      FROM club_channels c
      JOIN club_members cm ON c.club_id = cm.club_id
      WHERE cm.user_id = ${userId}::uuid
      UNION
      -- Doubt rooms user is registered for
      SELECT c.id AS channel_id
      FROM club_channels c
      JOIN registrations er ON c.event_id = er.event_id
      WHERE er.user_id = ${userId}::uuid AND er.status = 'CONFIRMED'
      UNION
      -- Doubt rooms user organizes
      SELECT c.id AS channel_id
      FROM club_channels c
      JOIN events e ON c.event_id = e.id
      LEFT JOIN club_members cm ON e.club_id = cm.club_id AND cm.user_id = ${userId}::uuid AND cm.role IN ('OWNER', 'ADMIN')
      WHERE e.created_by = ${userId}::uuid OR cm.user_id IS NOT NULL
      UNION
      -- Any channel the user previously read
      SELECT cr.channel_id
      FROM channel_reads cr
      WHERE cr.user_id = ${userId}::uuid
    )
    SELECT 
      uc.channel_id AS "channelId",
      COUNT(m.id)::int AS "unreadCount"
    FROM user_channels uc
    LEFT JOIN channel_reads cr 
      ON cr.channel_id = uc.channel_id AND cr.user_id = ${userId}::uuid
    LEFT JOIN messages m 
      ON m.channel_id = uc.channel_id
      AND m.author_id != ${userId}::uuid
      AND m.deleted_at IS NULL
      AND (cr.updated_at IS NULL OR m.created_at > cr.updated_at)
    GROUP BY uc.channel_id
  `);

  return result.rows.map((r: any) => ({
    channelId: r.channelId,
    unreadCount: Number(r.unreadCount || 0),
  }));
}

/**
 * Soft deletes a message: author within 15 minutes or club/event administrator anytime.
 */
export async function softDeleteMessage(messageId: string, userId: string) {
  const [message] = await db
    .select({
      id: messages.id,
      channelId: messages.channelId,
      authorId: messages.authorId,
      createdAt: messages.createdAt,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    throw new AppError('NOT_FOUND', 'Message not found.', 404);
  }

  if (message.deletedAt) {
    return { id: message.id, deletedAt: message.deletedAt, isDeleted: true };
  }

  const access = await checkChannelPostAccess(message.channelId, userId);
  const isAuthor = message.authorId === userId;
  const now = Date.now();
  const isWithin15Min = now - message.createdAt.getTime() <= 15 * 60 * 1000;

  if (isAuthor && isWithin15Min) {
    // Author allowed within 15 min window
  } else if (access.isOrganizerOrAdmin) {
    // Administrator allowed anytime
  } else if (isAuthor && !isWithin15Min) {
    throw new AppError(
      'FORBIDDEN',
      'Deletion window of 15 minutes has passed. Only administrators can delete this message.',
      403
    );
  } else {
    throw new AppError('FORBIDDEN', 'You do not have permission to delete this message.', 403);
  }

  const deletedAt = new Date();
  const [updated] = await db
    .update(messages)
    .set({ deletedAt })
    .where(eq(messages.id, messageId))
    .returning();

  if (!updated) {
    throw new AppError('NOT_FOUND', 'Message not found.', 404);
  }

  return {
    id: updated.id,
    deletedAt: updated.deletedAt,
    isDeleted: true,
  };
}
