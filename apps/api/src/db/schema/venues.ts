import {
  integer,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  capacity: integer('capacity').notNull(),
  locationText: text('location_text').notNull(),
  mapUrl: text('map_url'),
});

export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;

export const avResources = pgTable('av_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  kind: text('kind').notNull(), // PROJECTOR, MIC, SOUND_SYSTEM, CAMERA
  quantity: integer('quantity').notNull().default(1),
});

export type AvResource = typeof avResources.$inferSelect;
export type NewAvResource = typeof avResources.$inferInsert;
