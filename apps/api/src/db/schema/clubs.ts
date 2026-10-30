import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { ClubMemberRole } from '@eventora/shared';
import { clubMemberRoleEnum } from './enums';
import { users } from './users';

export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  logoKey: text('logo_key'),
  bannerKey: text('banner_key'),
  facultyCoordinatorId: uuid('faculty_coordinator_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdBy: uuid('created_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;

export const clubMembers = pgTable(
  'club_members',
  {
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: clubMemberRoleEnum('role').notNull().default(ClubMemberRole.MEMBER),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.clubId, table.userId] }),
  ]
);

export type ClubMember = typeof clubMembers.$inferSelect;
export type NewClubMember = typeof clubMembers.$inferInsert;
