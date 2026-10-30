import { z } from 'zod';
import { ProposalStatus } from '../enums';
import { isoDateTimeSchema, moneyPaiseSchema, uuidSchema } from './common';

export const submitProposalSchema = z.object({
  eventId: uuidSchema,
  venueRequested: z.string().min(2).max(100),
  avEquipment: z.array(z.string().min(1)).default([]),
  proposedBudgetPaise: moneyPaiseSchema.default(0),
  notes: z.string().max(2000).optional(),
  documentKeys: z.array(z.string().min(1)).default([]),
});

export type SubmitProposalInput = z.infer<typeof submitProposalSchema>;

export const proposalDecisionSchema = z.object({
  status: z.enum([ProposalStatus.APPROVED, ProposalStatus.REJECTED]),
  decisionNotes: z.string().max(1000).optional(),
  rejectionReason: z.string().max(500).optional(),
});

export type ProposalDecisionInput = z.infer<typeof proposalDecisionSchema>;

export const proposalResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  eventTitle: z.string().optional(),
  submittedByUserId: uuidSchema,
  submittedByName: z.string().optional(),
  venueRequested: z.string(),
  avEquipment: z.array(z.string()),
  proposedBudgetPaise: moneyPaiseSchema,
  notes: z.string().nullable().optional(),
  documentKeys: z.array(z.string()),
  status: z.nativeEnum(ProposalStatus),
  decisionNotes: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  decidedByUserId: uuidSchema.nullable().optional(),
  decidedAt: isoDateTimeSchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ProposalResponse = z.infer<typeof proposalResponseSchema>;
