import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ChannelKind } from '@eventora/shared';
import { clubs } from './clubs';
import { channelKindEnum } from './enums';
import { events } from './events';
import { users } from './users';

export const clubChannels = pgTable(
  'club_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    kind: channelKindEnum('kind').notNull().default(ChannelKind.GENERAL),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
  },
  (table) => [
    uniqueIndex('club_channels_club_slug_idx').on(table.clubId, table.slug),
    uniqueIndex('club_channels_event_slug_idx').on(table.eventId, table.slug),
    check(
      'club_channels_exactly_one_parent',
      sql`(${table.clubId} IS NOT NULL AND ${table.eventId} IS NULL) OR (${table.clubId} IS NULL AND ${table.eventId} IS NOT NULL)`
    ),
  ]
);

export type ClubChannel = typeof clubChannels.$inferSelect;
export type NewClubChannel = typeof clubChannels.$inferInsert;

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => clubChannels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    replyToId: uuid('reply_to_id'),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    authorRoleBadge: text('author_role_badge'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('messages_channel_cursor_idx').on(
      table.channelId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index('messages_channel_created_desc_idx').on(
      table.channelId,
      table.createdAt.desc()
    ),
  ]
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export const channelReads = pgTable(
  'channel_reads',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => clubChannels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.userId] }),
  ]
);

export type ChannelRead = typeof channelReads.$inferSelect;
export type NewChannelRead = typeof channelReads.$inferInsert;
