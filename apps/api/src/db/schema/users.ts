import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { UserRole } from '@eventora/shared';
import { userRoleEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  rollNumber: text('roll_number').unique(),
  department: text('department'),
  year: integer('year'),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  role: userRoleEnum('role').notNull().default(UserRole.STUDENT),
  strikeCount: integer('strike_count').notNull().default(0),
  consecutiveNoShows: integer('consecutive_no_shows').notNull().default(0),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
