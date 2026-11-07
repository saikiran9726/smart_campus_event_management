import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { notificationChannelEnum, notificationKindEnum } from './enums';
import { events } from './events';
import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    kind: notificationKindEnum('kind').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('QUEUED'), // QUEUED, ACCEPTED, SENT, DELIVERED, READ, FAILED, SKIPPED
    attempts: integer('attempts').notNull().default(0),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
  },
  (table) => [
    index('notifications_status_run_at_idx').on(table.status, table.runAt),
    index('notifications_provider_message_id_idx').on(table.providerMessageId),
    uniqueIndex('notifications_user_event_kind_channel_idx').on(
      table.userId,
      table.eventId,
      table.kind,
      table.channel
    ),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
