import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SkeletonChatBubble } from '@/components/primitives/skeleton-card';
import {
  Pin,
  Send,
  Reply,
  Check,
  CheckCheck,
  Calendar,
  ArrowRight,
  PinOff,
  Smile,
  Lock,
  ExternalLink,
} from 'lucide-react';

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId?: string;
  authorId?: string;
  senderName?: string;
  authorName?: string;
  content?: string;
  body?: string;
  replyToId?: string;
  replyTo?: {
    id: string;
    senderName?: string;
    authorName?: string;
    content?: string;
    body?: string;
  } | null;
  authorRoleBadge?: 'ORGANIZER' | 'FACULTY' | 'VOLUNTEER' | 'ATTENDEE' | 'WINNER' | null;
  isPinned?: boolean;
  pinnedAt?: string | null;
  isDeleted?: boolean;
  createdAt: string;
}

interface EventCardPayload {
  type: 'EVENT_CARD';
  eventId: string;
  title: string;
  date?: string;
  venue?: string;
  slug?: string;
  category?: string;
}

interface ChatThreadProps {
  channelId: string;
  channelName: string;
  channelKind?: 'CLUB' | 'DOUBT' | string;
  isReadOnly?: boolean;
  eventInfo?: {
    title: string;
    slug?: string;
  };
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  channelId,
  channelName,
  channelKind = 'CLUB',
  isReadOnly = false,
  eventInfo,
}) => {
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // Composer state
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingEmittedRef = useRef<number>(0);

  // Virtualizer DOM ref
  const parentRef = useRef<HTMLDivElement>(null);

  // Helper to parse event card envelope
  const parseEventCard = (bodyStr: string): EventCardPayload | null => {
    try {
      if (!bodyStr || (!bodyStr.startsWith('{') && !bodyStr.includes('"type":"EVENT_CARD"'))) {
        return null;
      }
      const jsonStart = bodyStr.indexOf('{');
      const jsonEnd = bodyStr.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(bodyStr.slice(jsonStart, jsonEnd + 1));
        if (parsed.type === 'EVENT_CARD') {
          return parsed as EventCardPayload;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  // 1. Initial messages fetch
  const fetchInitialMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{
        messages: ChatMessage[];
        nextCursor?: string;
        hasMore?: boolean;
      }>(`/channels/${channelId}/messages?limit=50`, { showToast: false });

      const fetched = res.messages || [];
      // Backend returns desc order (newest first) or asc. Reverse to chronological order (oldest top, newest bottom)
      const sorted = [...fetched].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      setMessages(sorted);
      setHasMoreOlder(Boolean(res.hasMore));
      setOldestCursor(res.nextCursor || null);

      // Load pinned
      try {
        const pinnedRes = await api.get<{ pinned: ChatMessage[] }>(
          `/channels/${channelId}/pinned`,
          { showToast: false }
        );
        setPinnedMessages(pinnedRes.pinned || []);
      } catch {
        // Ignore pinned load failure
      }
    } catch {
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void fetchInitialMessages();
  }, [fetchInitialMessages]);

  // 2. Fetch older messages on upward scroll
  const loadOlderMessages = async () => {
    if (!oldestCursor || isLoadingOlder || !hasMoreOlder) return;
    setIsLoadingOlder(true);

    try {
      const scrollEl = parentRef.current;
      const prevScrollHeight = scrollEl?.scrollHeight || 0;
      const prevScrollTop = scrollEl?.scrollTop || 0;

      const res = await api.get<{
        messages: ChatMessage[];
        nextCursor?: string;
        hasMore?: boolean;
      }>(`/channels/${channelId}/messages?cursor=${oldestCursor}&limit=50`, {
        showToast: false,
      });

      const older = res.messages || [];
      if (older.length > 0) {
        const sortedOlder = [...older].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        setMessages((prev) => [...sortedOlder, ...prev]);
        setOldestCursor(res.nextCursor || null);
        setHasMoreOlder(Boolean(res.hasMore));

        // Preserve scroll position without layout jump
        requestAnimationFrame(() => {
          if (scrollEl) {
            const newScrollHeight = scrollEl.scrollHeight;
            scrollEl.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          }
        });
      } else {
        setHasMoreOlder(false);
      }
    } catch {
      // Ignore pagination error
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // 3. Socket join and real-time event listeners
  useEffect(() => {
    if (!channelId) return;

    socket.emit('join:channel', { channelId });

    const handleNewMessage = (payload: { channelId: string; message: any }) => {
      if (payload.channelId !== channelId) return;
      const msg = payload.message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      // Emit read receipt
      socket.emit('chat:read', { channelId, lastReadMessageId: msg.id });

      // Auto scroll if near bottom
      const el = parentRef.current;
      if (el) {
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (isNearBottom) {
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
          });
        }
      }
    };

    const handlePinnedEvent = (payload: { channelId: string; messageId: string; isPinned: boolean }) => {
      if (payload.channelId !== channelId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, isPinned: payload.isPinned } : m))
      );
      // Reload pinned list
      api
        .get<{ pinned: ChatMessage[] }>(`/channels/${channelId}/pinned`, { showToast: false })
        .then((res) => setPinnedMessages(res.pinned || []))
        .catch(() => {});
    };

    const handleTypingEvent = (payload: {
      channelId: string;
      userId: string;
      userName: string;
      isTyping: boolean;
    }) => {
      if (payload.channelId !== channelId || payload.userId === currentUserId) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (payload.isTyping) {
          next.set(payload.userId, payload.userName);
        } else {
          next.delete(payload.userId);
        }
        return next;
      });
    };

    socket.on('chat:message', handleNewMessage);
    socket.on('chat:pinned', handlePinnedEvent);
    socket.on('chat:typing', handleTypingEvent);

    return () => {
      socket.emit('leave:channel', { channelId });
      socket.off('chat:message', handleNewMessage);
      socket.off('chat:pinned', handlePinnedEvent);
      socket.off('chat:typing', handleTypingEvent);
    };
  }, [channelId, currentUserId]);

  // 4. Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 8,
    initialRect: { width: 800, height: 600 },
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const itemsToRender =
    virtualItems.length > 0
      ? virtualItems.map((v) => ({
          index: v.index,
          start: v.start,
          measureRef: rowVirtualizer.measureElement,
        }))
      : messages.map((_, index) => ({
          index,
          start: index * 88,
          measureRef: undefined,
        }));

  // Auto-scroll to bottom upon initial load
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      const el = parentRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [isLoading, channelId]);

  // Check scroll position for loading older messages
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop < 60 && hasMoreOlder && !isLoadingOlder) {
      void loadOlderMessages();
    }
  };

  // 5. Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || isSending) return;

    setIsSending(true);
    try {
      const res = await api.post<{ message: ChatMessage }>(
        `/channels/${channelId}/messages`,
        {
          body: content,
          replyToId: replyingTo?.id,
        },
        { showToast: false }
      );

      if (res.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev;
          return [...prev, res.message];
        });
      }

      setText('');
      setReplyingTo(null);

      // Scroll to bottom
      requestAnimationFrame(() => {
        if (parentRef.current) {
          parentRef.current.scrollTop = parentRef.current.scrollHeight;
        }
      });
    } catch {
      // Handled by api interceptor
    } finally {
      setIsSending(false);
    }
  };

  // Typing event throttling
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);

    const now = Date.now();
    if (now - lastTypingEmittedRef.current > 2000) {
      lastTypingEmittedRef.current = now;
      socket.emit('chat:typing', {
        channelId,
        userName: user?.fullName || 'User',
        isTyping: true,
      });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('chat:typing', {
          channelId,
          userName: user?.fullName || 'User',
          isTyping: false,
        });
      }, 3000);
    }
  };

  // Pin/Unpin message
  const togglePin = async (message: ChatMessage) => {
    const isCurrentlyPinned = Boolean(message.isPinned || message.pinnedAt);
    try {
      if (isCurrentlyPinned) {
        await api.delete(`/channels/${channelId}/pin/${message.id}`, { showToast: false });
      } else {
        await api.post(`/channels/${channelId}/pin/${message.id}`, {}, { showToast: false });
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, isPinned: !isCurrentlyPinned } : m
        )
      );
    } catch {
      // Ignore
    }
  };

  // Jump to pinned message index in virtualizer
  const jumpToPinned = (targetId: string) => {
    const idx = messages.findIndex((m) => m.id === targetId);
    if (idx !== -1) {
      rowVirtualizer.scrollToIndex(idx, { align: 'center' });
    }
  };

  // Role Badge Styling
  const renderRoleBadge = (role?: string | null) => {
    if (!role) return null;
    switch (role) {
      case 'ORGANIZER':
        return (
          <Badge className="bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 text-[10px] px-1.5 py-0 font-bold tracking-wider">
            ORGANIZER
          </Badge>
        );
      case 'FACULTY':
        return (
          <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/30 text-[10px] px-1.5 py-0 font-bold tracking-wider">
            FACULTY
          </Badge>
        );
      case 'VOLUNTEER':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0 font-bold tracking-wider">
            VOLUNTEER
          </Badge>
        );
      case 'WINNER':
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] px-1.5 py-0 font-bold tracking-wider">
            WINNER
          </Badge>
        );
      case 'ATTENDEE':
        return (
          <Badge className="bg-slate-500/15 text-slate-300 border border-slate-500/30 text-[10px] px-1.5 py-0 font-medium">
            ATTENDEE
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Thread Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-bold text-white">#{channelName}</span>
          {channelKind === 'DOUBT' && (
            <Badge className="bg-indigo-500/15 text-indigo-300 border-indigo-500/30 text-[11px]">
              Live Doubt Room
            </Badge>
          )}
          {eventInfo && (
            <span className="text-xs text-slate-400 truncate max-w-[200px]">
              • {eventInfo.title}
            </span>
          )}
        </div>

        {pinnedMessages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const nextIdx = (activePinnedIndex + 1) % pinnedMessages.length;
              setActivePinnedIndex(nextIdx);
              const target = pinnedMessages[nextIdx];
              if (target) jumpToPinned(target.id);
            }}
            className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1.5 h-8 text-xs font-semibold px-2.5 rounded-full"
          >
            <Pin className="h-3.5 w-3.5" />
            <span>Pinned ({pinnedMessages.length})</span>
          </Button>
        )}
      </div>

      {/* Pinned Message Sticky Banner */}
      {pinnedMessages.length > 0 && pinnedMessages[activePinnedIndex] && (
        <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2 flex items-center justify-between text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2 truncate pr-2">
            <Pin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-amber-400 shrink-0">
              {pinnedMessages[activePinnedIndex]?.authorName || 'Pinned'}:
            </span>
            <span className="truncate">
              {pinnedMessages[activePinnedIndex]?.body || pinnedMessages[activePinnedIndex]?.content}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => jumpToPinned(pinnedMessages[activePinnedIndex]!.id)}
            className="text-amber-300 hover:text-white hover:bg-amber-900/50 h-6 px-2 text-[11px] font-bold rounded"
          >
            Jump
          </Button>
        </div>
      )}

      {/* Virtual Scroll Message Container */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        data-testid="virtual-chat-thread"
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2 select-text"
      >
        {isLoadingOlder && (
          <div className="text-center py-2 text-xs text-slate-500 font-semibold animate-pulse">
            Loading older messages...
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4 pt-4">
            <SkeletonChatBubble />
            <SkeletonChatBubble isSender />
            <SkeletonChatBubble />
            <SkeletonChatBubble isSender />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-2">
            <Smile className="h-10 w-10 text-slate-600" />
            <p className="text-sm font-semibold">No messages yet in #{channelName}</p>
            <p className="text-xs max-w-xs">
              Say hello or ask questions to kick off the campus conversation.
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {itemsToRender.map((virtualRow) => {
              const msg = messages[virtualRow.index];
              if (!msg) return null;

              const isMe =
                (msg.authorId && msg.authorId === currentUserId) ||
                (msg.senderId && msg.senderId === currentUserId);
              const authorName = msg.authorName || msg.senderName || 'Attendee';
              const bodyText = msg.body || msg.content || '';
              const eventCard = parseEventCard(bodyText);
              const isPinned = Boolean(msg.isPinned || msg.pinnedAt);

              return (
                <div
                  key={msg.id}
                  data-index={virtualRow.index}
                  ref={virtualRow.measureRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`flex flex-col py-1.5 ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`group relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-md text-sm ${
                      isMe
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none'
                    }`}
                  >
                    {/* Header: Author + Role Badge + Time */}
                    <div className="flex items-center gap-2 pb-1 text-xs">
                      <span className={`font-bold ${isMe ? 'text-indigo-100' : 'text-slate-300'}`}>
                        {authorName}
                      </span>
                      {renderRoleBadge(msg.authorRoleBadge)}
                      {isPinned && <Pin className="h-3 w-3 text-amber-400 shrink-0" />}
                    </div>

                    {/* Reply quote preview */}
                    {msg.replyTo && (
                      <div className="mb-2 p-2 rounded-lg bg-black/25 border-l-2 border-indigo-400 text-xs opacity-90">
                        <span className="font-semibold block text-indigo-300">
                          {msg.replyTo.authorName || msg.replyTo.senderName || 'Replied to'}
                        </span>
                        <p className="truncate line-clamp-1">
                          {msg.replyTo.body || msg.replyTo.content}
                        </p>
                      </div>
                    )}

                    {/* EVENT_CARD renderer or normal text */}
                    {eventCard ? (
                      <div className="my-1.5 p-3 rounded-xl bg-slate-950/70 border border-indigo-500/30 text-white space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                            {eventCard.category || 'CAMPUS EVENT'}
                          </span>
                          <Calendar className="h-4 w-4 text-indigo-400" />
                        </div>
                        <h4 className="font-bold text-base text-white">{eventCard.title}</h4>
                        {eventCard.date && (
                          <p className="text-xs text-slate-300">{eventCard.date}</p>
                        )}
                        <Link
                          to={eventCard.slug ? `/events/${eventCard.slug}` : `/events/${eventCard.eventId}`}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-300 hover:text-white bg-indigo-600/40 hover:bg-indigo-600/70 px-3 py-1.5 rounded-lg transition-all"
                        >
                          <span>View Event & Register</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words leading-relaxed text-sm">
                        {bodyText}
                      </p>
                    )}

                    {/* Footer: timestamp + delivery ticks + quick actions */}
                    <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] opacity-75">
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isMe && <CheckCheck className="h-3.5 w-3.5 text-indigo-200" />}
                    </div>

                    {/* Hover actions: Reply + Pin */}
                    <div
                      className={`absolute top-1 ${
                        isMe ? '-left-16' : '-right-16'
                      } opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 shadow-lg`}
                    >
                      <button
                        type="button"
                        onClick={() => setReplyingTo(msg)}
                        title="Reply"
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(msg)}
                        title={isPinned ? 'Unpin' : 'Pin'}
                        className={`p-1 rounded ${
                          isPinned
                            ? 'text-amber-400 hover:bg-slate-800'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Typing Indicator */}
      {typingUsers.size > 0 && (
        <div className="px-4 py-1 text-xs text-slate-400 italic bg-slate-900/50 border-t border-slate-800 shrink-0">
          {Array.from(typingUsers.values()).join(', ')} is typing...
        </div>
      )}

      {/* Reply Quote Bar */}
      {replyingTo && (
        <div className="bg-slate-900 px-4 py-2 border-t border-slate-800 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 truncate">
            <Reply className="h-4 w-4 text-indigo-400 shrink-0" />
            <span className="font-semibold text-slate-300">
              Replying to {replyingTo.authorName || replyingTo.senderName}:
            </span>
            <span className="text-slate-400 truncate">
              {replyingTo.body || replyingTo.content}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="text-slate-500 hover:text-slate-300 p-1 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Message Composer or Read-Only Notice */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
        {isReadOnly ? (
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-semibold text-slate-400">
            <Lock className="h-4 w-4 text-slate-500" />
            <span>Only club organizers and administrators can post in #{channelName}</span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <Input
              type="text"
              placeholder={`Message #${channelName}...`}
              value={text}
              onChange={handleInputChange}
              disabled={isSending}
              className="h-11 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-indigo-500 rounded-xl"
            />
            <Button
              type="submit"
              disabled={!text.trim() || isSending}
              className="h-11 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shrink-0 gap-1.5"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChatThread;
