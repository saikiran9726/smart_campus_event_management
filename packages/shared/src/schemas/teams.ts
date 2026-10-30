import { z } from 'zod';
import { TEAM_CODE_LENGTH } from '../constants';
import { TeamStatus } from '../enums';
import { isoDateTimeSchema, uuidSchema } from './common';

export const createTeamSchema = z.object({
  eventId: uuidSchema,
  name: z.string().min(2).max(60),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const joinTeamSchema = z.object({
  teamCode: z.string().length(TEAM_CODE_LENGTH, `Team code must be ${TEAM_CODE_LENGTH} characters`),
});

export type JoinTeamInput = z.infer<typeof joinTeamSchema>;

export const leaveTeamSchema = z.object({
  teamId: uuidSchema,
});

export type LeaveTeamInput = z.infer<typeof leaveTeamSchema>;

export const lockTeamSchema = z.object({
  teamId: uuidSchema,
});

export type LockTeamInput = z.infer<typeof lockTeamSchema>;

export const updateTeamProjectSchema = z.object({
  teamId: uuidSchema,
  projectTitle: z.string().min(2).max(150),
  projectDescription: z.string().min(10).max(4000),
  projectUrl: z.string().url().optional(),
  repoUrl: z.string().url().optional(),
});

export type UpdateTeamProjectInput = z.infer<typeof updateTeamProjectSchema>;

export const teamMemberSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  userId: uuidSchema,
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().nullable().optional(),
  isLeader: z.boolean(),
  joinedAt: isoDateTimeSchema,
});

export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  eventTitle: z.string().optional(),
  name: z.string(),
  code: z.string(),
  leaderId: uuidSchema,
  status: z.nativeEnum(TeamStatus),
  projectTitle: z.string().nullable().optional(),
  projectDescription: z.string().nullable().optional(),
  projectUrl: z.string().url().nullable().optional(),
  repoUrl: z.string().url().nullable().optional(),
  memberCount: z.number().int().positive(),
  members: z.array(teamMemberSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type TeamResponse = z.infer<typeof teamResponseSchema>;
