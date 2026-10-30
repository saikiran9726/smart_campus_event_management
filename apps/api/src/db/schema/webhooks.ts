import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const webhookEvents = pgTable('webhook_events', {
  svixId: text('svix_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
