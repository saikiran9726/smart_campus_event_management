import { z } from 'zod';
import { ClubMemberRole, UserRole } from '../enums';
import { isoDateTimeSchema, uuidSchema } from './common';

export const userClubMembershipSchema = z.object({
  clubId: uuidSchema,
  clubName: z.string(),
  role: z.nativeEnum(ClubMemberRole),
});

export type UserClubMembership = z.infer<typeof userClubMembershipSchema>;

export const authUserSchema = z.object({
  id: uuidSchema,
  clerkId: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  yearOfStudy: z.number().int().min(1).max(5).nullable().optional(),
  role: z.nativeEnum(UserRole),
  strikesCount: z.number().int().nonnegative(),
  cooldownUntil: isoDateTimeSchema.nullable().optional(),
  clubs: z.array(userClubMembershipSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const authMeResponseSchema = z.object({
  user: authUserSchema,
});

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const updateUserProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  yearOfStudy: z.number().int().min(1).max(5).nullable().optional(),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
