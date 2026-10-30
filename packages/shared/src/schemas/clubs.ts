import { z } from 'zod';
import { ClubMemberRole } from '../enums';
import { isoDateTimeSchema, paginationQuerySchema, uuidSchema } from './common';

export const createClubSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must consist of lowercase alphanumeric chars and hyphens'),
  description: z.string().min(10).max(2000),
  category: z.string().min(2).max(50),
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  facultyAdvisorEmail: z.string().email(),
});

export type CreateClubInput = z.infer<typeof createClubSchema>;

export const updateClubSchema = createClubSchema.partial();

export type UpdateClubInput = z.infer<typeof updateClubSchema>;

export const addClubMemberSchema = z.object({
  userId: uuidSchema,
  role: z.nativeEnum(ClubMemberRole).default(ClubMemberRole.MEMBER),
});

export type AddClubMemberInput = z.infer<typeof addClubMemberSchema>;

export const updateClubMemberRoleSchema = z.object({
  role: z.nativeEnum(ClubMemberRole),
});

export type UpdateClubMemberRoleInput = z.infer<typeof updateClubMemberRoleSchema>;

export const clubMemberSchema = z.object({
  id: uuidSchema,
  clubId: uuidSchema,
  userId: uuidSchema,
  role: z.nativeEnum(ClubMemberRole),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().nullable().optional(),
  joinedAt: isoDateTimeSchema,
});

export type ClubMember = z.infer<typeof clubMemberSchema>;

export const clubResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  category: z.string(),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  facultyAdvisorEmail: z.string().email(),
  memberCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ClubResponse = z.infer<typeof clubResponseSchema>;

export const clubListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  category: z.string().optional(),
});

export type ClubListQuery = z.infer<typeof clubListQuerySchema>;
