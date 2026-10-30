import { relations } from 'drizzle-orm';
import { auditLogs } from './audit';
import { budgetAllocations, expenseItems } from './budget';
import { channelReads, clubChannels, messages } from './channels';
import { clubMembers, clubs } from './clubs';
import { certificates, odLetters, reviews, winners } from './evaluations';
import { eventAvBookings, events, venueBookings } from './events';
import { formQuestions } from './forms';
import { notifications } from './notifications';
import { ledgerEntries, payments } from './payments';
import { eventProposals, magicLinkJti, proposalAvRequests } from './proposals';
import { bookingAnswers, registrations, waitlistEntries } from './registrations';
import { teamMembers, teammatePool, teamRosterSnapshots, teams } from './teams';
import {
  scanLogs,
  scannerPasskeys,
  scannerSessions,
  ticketRedemptions,
  tickets,
} from './tickets';
import { users } from './users';
import { avResources, venues } from './venues';

export const usersRelations = relations(users, ({ many }) => ({
  clubsCreated: many(clubs, { relationName: 'clubCreator' }),
  clubsAdvised: many(clubs, { relationName: 'facultyCoordinator' }),
  clubMemberships: many(clubMembers),
  proposalsSubmitted: many(eventProposals, { relationName: 'proposedBy' }),
  proposalsAdvised: many(eventProposals, { relationName: 'facultyAdvisor' }),
  eventsCreated: many(events, { relationName: 'eventCreator' }),
  registrations: many(registrations),
  tickets: many(tickets, { relationName: 'ticketAttendee' }),
  ticketsCheckedIn: many(tickets, { relationName: 'ticketChecker' }),
  redemptionsProcessed: many(ticketRedemptions),
  scannerPasskeysCreated: many(scannerPasskeys),
  scannerSessions: many(scannerSessions),
  scanLogs: many(scanLogs),
  notifications: many(notifications),
  messages: many(messages),
  channelReads: many(channelReads),
  teamsLed: many(teams),
  teamMemberships: many(teamMembers),
  teammatePoolEntries: many(teammatePool),
  reviews: many(reviews),
  odLetters: many(odLetters),
  certificates: many(certificates),
  expenseItemsSignedOff: many(expenseItems),
  auditLogs: many(auditLogs),
}));

export const clubsRelations = relations(clubs, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [clubs.createdBy],
    references: [users.id],
    relationName: 'clubCreator',
  }),
  facultyCoordinator: one(users, {
    fields: [clubs.facultyCoordinatorId],
    references: [users.id],
    relationName: 'facultyCoordinator',
  }),
  members: many(clubMembers),
  proposals: many(eventProposals),
  events: many(events),
  channels: many(clubChannels),
  budgetAllocations: many(budgetAllocations),
}));

export const clubMembersRelations = relations(clubMembers, ({ one }) => ({
  club: one(clubs, {
    fields: [clubMembers.clubId],
    references: [clubs.id],
  }),
  user: one(users, {
    fields: [clubMembers.userId],
    references: [users.id],
  }),
}));

export const venuesRelations = relations(venues, ({ many }) => ({
  proposals: many(eventProposals),
  events: many(events),
  bookings: many(venueBookings),
}));

export const avResourcesRelations = relations(avResources, ({ many }) => ({
  proposalRequests: many(proposalAvRequests),
  eventBookings: many(eventAvBookings),
}));

export const eventProposalsRelations = relations(eventProposals, ({ one, many }) => ({
  club: one(clubs, {
    fields: [eventProposals.clubId],
    references: [clubs.id],
  }),
  proposedBy: one(users, {
    fields: [eventProposals.proposedBy],
    references: [users.id],
    relationName: 'proposedBy',
  }),
  faculty: one(users, {
    fields: [eventProposals.facultyId],
    references: [users.id],
    relationName: 'facultyAdvisor',
  }),
  venue: one(venues, {
    fields: [eventProposals.venueId],
    references: [venues.id],
  }),
  avRequests: many(proposalAvRequests),
  magicLinks: many(magicLinkJti),
  venueBookings: many(venueBookings),
  events: many(events),
}));

export const proposalAvRequestsRelations = relations(proposalAvRequests, ({ one }) => ({
  proposal: one(eventProposals, {
    fields: [proposalAvRequests.proposalId],
    references: [eventProposals.id],
  }),
  avResource: one(avResources, {
    fields: [proposalAvRequests.avResourceId],
    references: [avResources.id],
  }),
}));

export const magicLinkJtiRelations = relations(magicLinkJti, ({ one }) => ({
  proposal: one(eventProposals, {
    fields: [magicLinkJti.proposalId],
    references: [eventProposals.id],
  }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  club: one(clubs, {
    fields: [events.clubId],
    references: [clubs.id],
  }),
  proposal: one(eventProposals, {
    fields: [events.proposalId],
    references: [eventProposals.id],
  }),
  venue: one(venues, {
    fields: [events.venueId],
    references: [venues.id],
  }),
  createdBy: one(users, {
    fields: [events.createdBy],
    references: [users.id],
    relationName: 'eventCreator',
  }),
  avBookings: many(eventAvBookings),
  venueBookings: many(venueBookings),
  formQuestions: many(formQuestions),
  registrations: many(registrations),
  waitlistEntries: many(waitlistEntries),
  tickets: many(tickets),
  scannerPasskeys: many(scannerPasskeys),
  scanLogs: many(scanLogs),
  channels: many(clubChannels),
  teams: many(teams),
  teamMembers: many(teamMembers),
  teammatePool: many(teammatePool),
  winners: many(winners),
  reviews: many(reviews),
  odLetters: many(odLetters),
  certificates: many(certificates),
  budgetAllocations: many(budgetAllocations),
  notifications: many(notifications),
}));

export const eventAvBookingsRelations = relations(eventAvBookings, ({ one }) => ({
  event: one(events, {
    fields: [eventAvBookings.eventId],
    references: [events.id],
  }),
  avResource: one(avResources, {
    fields: [eventAvBookings.avResourceId],
    references: [avResources.id],
  }),
}));

export const venueBookingsRelations = relations(venueBookings, ({ one }) => ({
  event: one(events, {
    fields: [venueBookings.eventId],
    references: [events.id],
  }),
  proposal: one(eventProposals, {
    fields: [venueBookings.proposalId],
    references: [eventProposals.id],
  }),
  venue: one(venues, {
    fields: [venueBookings.venueId],
    references: [venues.id],
  }),
}));

export const formQuestionsRelations = relations(formQuestions, ({ one, many }) => ({
  event: one(events, {
    fields: [formQuestions.eventId],
    references: [events.id],
  }),
  answers: many(bookingAnswers),
}));

export const registrationsRelations = relations(registrations, ({ one, many }) => ({
  event: one(events, {
    fields: [registrations.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [registrations.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [registrations.teamId],
    references: [teams.id],
  }),
  ticket: one(tickets),
  answers: many(bookingAnswers),
  payments: many(payments),
  waitlistEntries: many(waitlistEntries),
}));

export const waitlistEntriesRelations = relations(waitlistEntries, ({ one }) => ({
  event: one(events, {
    fields: [waitlistEntries.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [waitlistEntries.userId],
    references: [users.id],
  }),
  registration: one(registrations, {
    fields: [waitlistEntries.registrationId],
    references: [registrations.id],
  }),
}));

export const bookingAnswersRelations = relations(bookingAnswers, ({ one }) => ({
  registration: one(registrations, {
    fields: [bookingAnswers.registrationId],
    references: [registrations.id],
  }),
  question: one(formQuestions, {
    fields: [bookingAnswers.questionId],
    references: [formQuestions.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  registration: one(registrations, {
    fields: [payments.registrationId],
    references: [registrations.id],
  }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  payment: one(payments, {
    fields: [ledgerEntries.paymentId],
    references: [payments.id],
  }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  registration: one(registrations, {
    fields: [tickets.registrationId],
    references: [registrations.id],
  }),
  event: one(events, {
    fields: [tickets.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [tickets.userId],
    references: [users.id],
    relationName: 'ticketAttendee',
  }),
  checkedInBy: one(users, {
    fields: [tickets.checkedInBy],
    references: [users.id],
    relationName: 'ticketChecker',
  }),
  redemptions: many(ticketRedemptions),
  scanLogs: many(scanLogs),
}));

export const ticketRedemptionsRelations = relations(ticketRedemptions, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketRedemptions.ticketId],
    references: [tickets.id],
  }),
  redeemedBy: one(users, {
    fields: [ticketRedemptions.redeemedBy],
    references: [users.id],
  }),
}));

export const scannerPasskeysRelations = relations(scannerPasskeys, ({ one, many }) => ({
  event: one(events, {
    fields: [scannerPasskeys.eventId],
    references: [events.id],
  }),
  createdBy: one(users, {
    fields: [scannerPasskeys.createdBy],
    references: [users.id],
  }),
  sessions: many(scannerSessions),
  scanLogs: many(scanLogs),
}));

export const scannerSessionsRelations = relations(scannerSessions, ({ one }) => ({
  passkey: one(scannerPasskeys, {
    fields: [scannerSessions.passkeyId],
    references: [scannerPasskeys.id],
  }),
  user: one(users, {
    fields: [scannerSessions.userId],
    references: [users.id],
  }),
}));

export const scanLogsRelations = relations(scanLogs, ({ one }) => ({
  event: one(events, {
    fields: [scanLogs.eventId],
    references: [events.id],
  }),
  scannerUser: one(users, {
    fields: [scanLogs.scannerUserId],
    references: [users.id],
  }),
  passkey: one(scannerPasskeys, {
    fields: [scanLogs.passkeyId],
    references: [scannerPasskeys.id],
  }),
  ticket: one(tickets, {
    fields: [scanLogs.ticketId],
    references: [tickets.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [notifications.eventId],
    references: [events.id],
  }),
}));

export const clubChannelsRelations = relations(clubChannels, ({ one, many }) => ({
  club: one(clubs, {
    fields: [clubChannels.clubId],
    references: [clubs.id],
  }),
  event: one(events, {
    fields: [clubChannels.eventId],
    references: [events.id],
  }),
  messages: many(messages),
  reads: many(channelReads),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(clubChannels, {
    fields: [messages.channelId],
    references: [clubChannels.id],
  }),
  author: one(users, {
    fields: [messages.authorId],
    references: [users.id],
  }),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
    relationName: 'replies',
  }),
  replies: many(messages, { relationName: 'replies' }),
  reads: many(channelReads),
}));

export const channelReadsRelations = relations(channelReads, ({ one }) => ({
  channel: one(clubChannels, {
    fields: [channelReads.channelId],
    references: [clubChannels.id],
  }),
  user: one(users, {
    fields: [channelReads.userId],
    references: [users.id],
  }),
  lastReadMessage: one(messages, {
    fields: [channelReads.lastReadMessageId],
    references: [messages.id],
  }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  event: one(events, {
    fields: [teams.eventId],
    references: [events.id],
  }),
  leader: one(users, {
    fields: [teams.leaderId],
    references: [users.id],
  }),
  members: many(teamMembers),
  snapshots: many(teamRosterSnapshots),
  registrations: many(registrations),
  winners: many(winners),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [teamMembers.eventId],
    references: [events.id],
  }),
}));

export const teamRosterSnapshotsRelations = relations(teamRosterSnapshots, ({ one }) => ({
  team: one(teams, {
    fields: [teamRosterSnapshots.teamId],
    references: [teams.id],
  }),
}));

export const teammatePoolRelations = relations(teammatePool, ({ one }) => ({
  event: one(events, {
    fields: [teammatePool.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [teammatePool.userId],
    references: [users.id],
  }),
}));

export const winnersRelations = relations(winners, ({ one }) => ({
  event: one(events, {
    fields: [winners.eventId],
    references: [events.id],
  }),
  team: one(teams, {
    fields: [winners.teamId],
    references: [teams.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  event: one(events, {
    fields: [reviews.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
}));

export const odLettersRelations = relations(odLetters, ({ one }) => ({
  event: one(events, {
    fields: [odLetters.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [odLetters.userId],
    references: [users.id],
  }),
}));

export const certificatesRelations = relations(certificates, ({ one }) => ({
  event: one(events, {
    fields: [certificates.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [certificates.userId],
    references: [users.id],
  }),
}));

export const budgetAllocationsRelations = relations(budgetAllocations, ({ one, many }) => ({
  club: one(clubs, {
    fields: [budgetAllocations.clubId],
    references: [clubs.id],
  }),
  event: one(events, {
    fields: [budgetAllocations.eventId],
    references: [events.id],
  }),
  expenses: many(expenseItems),
}));

export const expenseItemsRelations = relations(expenseItems, ({ one }) => ({
  allocation: one(budgetAllocations, {
    fields: [expenseItems.allocationId],
    references: [budgetAllocations.id],
  }),
  signedOffByUser: one(users, {
    fields: [expenseItems.signedOffBy],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
}));
