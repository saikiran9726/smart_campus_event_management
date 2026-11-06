import { pgEnum } from 'drizzle-orm/pg-core';
import {
  ChannelKind,
  ClubMemberRole,
  EventStatus,
  NotificationChannel,
  NotificationKind,
  PaymentStatus,
  ProposalStatus,
  QuestionType,
  RegistrationStatus,
  ScanMode,
  ScanResult,
  TeamStatus,
  TicketStatus,
  UserRole,
} from '@eventora/shared';

export const userRoleEnum = pgEnum('user_role', [
  UserRole.STUDENT,
  UserRole.ORGANIZER,
  UserRole.FACULTY,
  UserRole.ADMIN,
]);

export const clubMemberRoleEnum = pgEnum('club_member_role', [
  ClubMemberRole.OWNER,
  ClubMemberRole.ADMIN,
  ClubMemberRole.MEMBER,
]);

export const eventStatusEnum = pgEnum('event_status', [
  EventStatus.DRAFT,
  EventStatus.PENDING_APPROVAL,
  EventStatus.APPROVED,
  EventStatus.PUBLISHED,
  EventStatus.LIVE,
  EventStatus.COMPLETED,
  EventStatus.CANCELLED,
]);

export const proposalStatusEnum = pgEnum('proposal_status', [
  ProposalStatus.PENDING,
  ProposalStatus.APPROVED,
  ProposalStatus.REJECTED,
]);

export const registrationStatusEnum = pgEnum('registration_status', [
  RegistrationStatus.CONFIRMED,
  RegistrationStatus.WAITLISTED,
  RegistrationStatus.OFFERED,
  RegistrationStatus.CANCELLED,
  RegistrationStatus.EXPIRED,
  RegistrationStatus.NO_SHOW,
]);

export const ticketStatusEnum = pgEnum('ticket_status', [
  TicketStatus.VALID,
  TicketStatus.CHECKED_IN,
  TicketStatus.VOID,
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  PaymentStatus.NOT_REQUIRED,
  PaymentStatus.PENDING,
  PaymentStatus.SUCCEEDED,
  PaymentStatus.FAILED,
  PaymentStatus.REFUNDED,
]);

export const questionTypeEnum = pgEnum('question_type', [
  QuestionType.SHORT_TEXT,
  QuestionType.LONG_TEXT,
  QuestionType.NUMBER,
  QuestionType.EMAIL,
  QuestionType.PHONE,
  QuestionType.SINGLE_SELECT,
  QuestionType.MULTI_SELECT,
  QuestionType.CHECKBOX,
  QuestionType.DATE,
  QuestionType.FILE_UPLOAD,
  QuestionType.DROPDOWN,
  QuestionType.RADIO,
  QuestionType.URL,
  QuestionType.YES_NO,
  QuestionType.INSTRUCTION,
]);

export const scanModeEnum = pgEnum('scan_mode', [
  ScanMode.GATE,
  ScanMode.MEAL,
  ScanMode.KIT,
]);

export const scanResultEnum = pgEnum('scan_result', [
  ScanResult.GREEN,
  ScanResult.RED,
  ScanResult.YELLOW,
]);

export const channelKindEnum = pgEnum('channel_kind', [
  ChannelKind.ANNOUNCEMENTS,
  ChannelKind.GENERAL,
  ChannelKind.EVENTS,
  ChannelKind.DOUBT,
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  NotificationChannel.EMAIL,
  NotificationChannel.WHATSAPP,
  NotificationChannel.IN_APP,
]);

export const notificationKindEnum = pgEnum('notification_kind', [
  NotificationKind.BOOKING_CONFIRMED,
  NotificationKind.REMINDER_24H,
  NotificationKind.REMINDER_2H,
  NotificationKind.WAITLIST_OFFER,
  NotificationKind.FACULTY_APPROVAL,
  NotificationKind.STRIKE_NOTICE,
  NotificationKind.REGISTRATION_APPROVED,
  NotificationKind.REGISTRATION_REJECTED,
  NotificationKind.PAYMENT_SUCCESS,
  NotificationKind.PAYMENT_FAILED,
  NotificationKind.TEAM_INVITATION,
  NotificationKind.REGISTRATION_CANCELLED,
  NotificationKind.ORGANIZER_ALERT,
]);

export const teamStatusEnum = pgEnum('team_status', [
  TeamStatus.FORMING,
  TeamStatus.LOCKED,
  TeamStatus.SUBMITTED,
  TeamStatus.DISQUALIFIED,
]);
