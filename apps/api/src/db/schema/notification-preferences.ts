import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  inAppEnabled: boolean('in_app_enabled').notNull().default(true),
  whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
  eventReminders: boolean('event_reminders').notNull().default(true),
  registrationUpdates: boolean('registration_updates').notNull().default(true),
  teamUpdates: boolean('team_updates').notNull().default(true),
  announcements: boolean('announcements').notNull().default(true),
  volunteerUpdates: boolean('volunteer_updates').notNull().default(true),
  whatsappConsentAt: timestamp('whatsapp_consent_at', { withTimezone: true }),
  whatsappConsentWithdrawnAt: timestamp('whatsapp_consent_withdrawn_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
