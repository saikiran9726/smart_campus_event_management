import { ScanResult } from './enums';

export interface SeatsUpdatePayload {
  eventId: string;
  remaining: number;
}

export interface WaitlistPositionPayload {
  eventId: string;
  position: number;
}

export interface ChatMessagePayload {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  attachments?: string[];
  isPinned: boolean;
  createdAt: string;
}

export interface ChatTypingPayload {
  channelId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

export interface ChatReadPayload {
  channelId: string;
  userId: string;
  lastReadMessageId: string;
}

export interface ChatPinnedPayload {
  channelId: string;
  messageId: string;
  isPinned: boolean;
}

export interface ScanResultPayload {
  scanId: string;
  result: ScanResult;
  attendeeName?: string;
  ticketId?: string;
  message: string;
  timestamp: string;
}

export interface JoinChannelPayload {
  channelId: string;
}

export interface LeaveChannelPayload {
  channelId: string;
}

export interface ServerToClientEvents {
  'seats:update': (data: SeatsUpdatePayload) => void;
  'waitlist:position': (data: WaitlistPositionPayload) => void;
  'chat:message': (data: { channelId: string; message: ChatMessagePayload }) => void;
  'chat:typing': (data: ChatTypingPayload) => void;
  'chat:read': (data: ChatReadPayload) => void;
  'chat:pinned': (data: ChatPinnedPayload) => void;
  'scan:result': (data: ScanResultPayload) => void;
}

export interface ClientToServerEvents {
  'join:channel': (data: JoinChannelPayload) => void;
  'leave:channel': (data: LeaveChannelPayload) => void;
  'chat:typing': (data: ChatTypingPayload) => void;
  'chat:read': (data: ChatReadPayload) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
  role?: string;
}
