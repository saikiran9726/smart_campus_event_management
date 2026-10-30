export enum UserRole {
  STUDENT = 'STUDENT',
  ORGANIZER = 'ORGANIZER',
  FACULTY = 'FACULTY',
  ADMIN = 'ADMIN',
}

export const USER_ROLES = [
  UserRole.STUDENT,
  UserRole.ORGANIZER,
  UserRole.FACULTY,
  UserRole.ADMIN,
] as const;

export enum ClubMemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export const CLUB_MEMBER_ROLES = [
  ClubMemberRole.OWNER,
  ClubMemberRole.ADMIN,
  ClubMemberRole.MEMBER,
] as const;

export enum EventStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  LIVE = 'LIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const EVENT_STATUSES = [
  EventStatus.DRAFT,
  EventStatus.PENDING_APPROVAL,
  EventStatus.APPROVED,
  EventStatus.PUBLISHED,
  EventStatus.LIVE,
  EventStatus.COMPLETED,
  EventStatus.CANCELLED,
] as const;

export enum ProposalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const PROPOSAL_STATUSES = [
  ProposalStatus.PENDING,
  ProposalStatus.APPROVED,
  ProposalStatus.REJECTED,
] as const;

export enum RegistrationStatus {
  CONFIRMED = 'CONFIRMED',
  WAITLISTED = 'WAITLISTED',
  OFFERED = 'OFFERED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  NO_SHOW = 'NO_SHOW',
}

export const REGISTRATION_STATUSES = [
  RegistrationStatus.CONFIRMED,
  RegistrationStatus.WAITLISTED,
  RegistrationStatus.OFFERED,
  RegistrationStatus.CANCELLED,
  RegistrationStatus.EXPIRED,
  RegistrationStatus.NO_SHOW,
] as const;

export enum TicketStatus {
  VALID = 'VALID',
  CHECKED_IN = 'CHECKED_IN',
  VOID = 'VOID',
}

export const TICKET_STATUSES = [
  TicketStatus.VALID,
  TicketStatus.CHECKED_IN,
  TicketStatus.VOID,
] as const;

export enum PaymentStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export const PAYMENT_STATUSES = [
  PaymentStatus.NOT_REQUIRED,
  PaymentStatus.PENDING,
  PaymentStatus.SUCCEEDED,
  PaymentStatus.FAILED,
  PaymentStatus.REFUNDED,
] as const;

export enum QuestionType {
  SHORT_TEXT = 'SHORT_TEXT',
  LONG_TEXT = 'LONG_TEXT',
  NUMBER = 'NUMBER',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  SINGLE_SELECT = 'SINGLE_SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  CHECKBOX = 'CHECKBOX',
  DATE = 'DATE',
  FILE_UPLOAD = 'FILE_UPLOAD',
}

export const QUESTION_TYPES = [
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
] as const;

export enum ScanMode {
  GATE = 'GATE',
  MEAL = 'MEAL',
  KIT = 'KIT',
}

export const SCAN_MODES = [
  ScanMode.GATE,
  ScanMode.MEAL,
  ScanMode.KIT,
] as const;

export enum ScanResult {
  GREEN = 'GREEN',
  RED = 'RED',
  YELLOW = 'YELLOW',
}

export const SCAN_RESULTS = [
  ScanResult.GREEN,
  ScanResult.RED,
  ScanResult.YELLOW,
] as const;

export enum ChannelKind {
  ANNOUNCEMENTS = 'ANNOUNCEMENTS',
  GENERAL = 'GENERAL',
  EVENTS = 'EVENTS',
  DOUBT = 'DOUBT',
}

export const CHANNEL_KINDS = [
  ChannelKind.ANNOUNCEMENTS,
  ChannelKind.GENERAL,
  ChannelKind.EVENTS,
  ChannelKind.DOUBT,
] as const;

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

export const NOTIFICATION_CHANNELS = [
  NotificationChannel.EMAIL,
  NotificationChannel.WHATSAPP,
] as const;

export enum NotificationKind {
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  REMINDER_24H = 'REMINDER_24H',
  REMINDER_2H = 'REMINDER_2H',
  WAITLIST_OFFER = 'WAITLIST_OFFER',
  FACULTY_APPROVAL = 'FACULTY_APPROVAL',
  STRIKE_NOTICE = 'STRIKE_NOTICE',
}

export const NOTIFICATION_KINDS = [
  NotificationKind.BOOKING_CONFIRMED,
  NotificationKind.REMINDER_24H,
  NotificationKind.REMINDER_2H,
  NotificationKind.WAITLIST_OFFER,
  NotificationKind.FACULTY_APPROVAL,
  NotificationKind.STRIKE_NOTICE,
] as const;

export enum TeamStatus {
  FORMING = 'FORMING',
  LOCKED = 'LOCKED',
  SUBMITTED = 'SUBMITTED',
  DISQUALIFIED = 'DISQUALIFIED',
}

export const TEAM_STATUSES = [
  TeamStatus.FORMING,
  TeamStatus.LOCKED,
  TeamStatus.SUBMITTED,
  TeamStatus.DISQUALIFIED,
] as const;
