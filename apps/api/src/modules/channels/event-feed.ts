import { and, eq } from 'drizzle-orm';
import { ChannelKind } from '@eventora/shared';
import { db } from '../../db/client';
import { clubChannels, events, messages, venues } from '../../db/schema';
import { getIO } from '../../realtime/io';

export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export interface EventCardEnvelope {
  type: 'EVENT_CARD';
  eventId: string;
  action: 'PUBLISHED' | 'RESCHEDULED' | 'CANCELLED';
  event: {
    id: string;
    title: string;
    slug: string;
    startAt: string;
    endAt: string;
    venueName: string | null;
    remainingCapacity: number;
    pricePaise: number;
    isPaid: boolean;
  };
}

/**
 * Ensures that an event has an active Doubt Room channel.
 */
export async function ensureEventDoubtRoom(eventId: string): Promise<string> {
  const [existing] = await db
    .select({ id: clubChannels.id })
    .from(clubChannels)
    .where(
      and(
        eq(clubChannels.eventId, eventId),
        eq(clubChannels.kind, ChannelKind.DOUBT)
      )
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(clubChannels)
    .values({
      eventId,
      kind: ChannelKind.DOUBT,
      name: 'doubt-room',
      slug: 'doubt-room',
    })
    .onConflictDoNothing()
    .returning({ id: clubChannels.id });

  if (created) {
    return created.id;
  }

  // If another thread won the conflict, query it
  const [channel] = await db
    .select({ id: clubChannels.id })
    .from(clubChannels)
    .where(
      and(
        eq(clubChannels.eventId, eventId),
        eq(clubChannels.kind, ChannelKind.DOUBT)
      )
    )
    .limit(1);

  return channel?.id || '';
}

/**
 * Posts an event card notification to the club's `#events` system channel.
 */
export async function postEventCardToFeed(
  eventId: string,
  action: 'PUBLISHED' | 'RESCHEDULED' | 'CANCELLED'
): Promise<void> {
  // Load event details with venue
  const [event] = await db
    .select({
      id: events.id,
      clubId: events.clubId,
      title: events.title,
      slug: events.slug,
      startAt: events.startAt,
      endAt: events.endAt,
      venueId: events.venueId,
      remainingCapacity: events.remainingCapacity,
      pricePaise: events.pricePaise,
      isPaid: events.isPaid,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event || !event.clubId) {
    return;
  }

  let venueName: string | null = null;
  if (event.venueId) {
    const [venue] = await db
      .select({ name: venues.name })
      .from(venues)
      .where(eq(venues.id, event.venueId))
      .limit(1);
    if (venue) {
      venueName = venue.name;
    }
  }

  // Find club's #events channel
  const [eventsChannel] = await db
    .select({ id: clubChannels.id })
    .from(clubChannels)
    .where(
      and(
        eq(clubChannels.clubId, event.clubId),
        eq(clubChannels.kind, ChannelKind.EVENTS)
      )
    )
    .limit(1);

  if (!eventsChannel) {
    return;
  }

  const envelope: EventCardEnvelope = {
    type: 'EVENT_CARD',
    eventId: event.id,
    action,
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt.toISOString(),
      venueName,
      remainingCapacity: event.remainingCapacity,
      pricePaise: event.pricePaise,
      isPaid: event.isPaid,
    },
  };

  const [inserted] = await db
    .insert(messages)
    .values({
      channelId: eventsChannel.id,
      authorId: SYSTEM_USER_ID,
      body: JSON.stringify(envelope),
      authorRoleBadge: 'SYSTEM',
    })
    .returning();

  if (!inserted) {
    return;
  }

  // Broadcast over Socket.IO if available
  try {
    const io = getIO();
    const roomName = `channel:${eventsChannel.id}`;
    const sockets = await io.in(roomName).allSockets();
    const deliveryCount = sockets ? sockets.size : 0;

    io.to(roomName).emit('chat:message', {
      channelId: eventsChannel.id,
      message: {
        id: inserted.id,
        channelId: eventsChannel.id,
        senderId: SYSTEM_USER_ID,
        senderName: 'Eventora System',
        content: inserted.body,
        isPinned: false,
        createdAt: inserted.createdAt.toISOString(),
      },
      ...({ deliveryCount } as any),
    } as any);
  } catch {
    // Socket.IO may not be initialized in non-server contexts (e.g. CLI scripts)
  }
}
