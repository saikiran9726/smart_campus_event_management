import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChatThread } from './ChatThread';
import {
  Hash,
  Sparkles,
  Megaphone,
  Calendar,
  ChevronLeft,
  Users,
  Compass,
} from 'lucide-react';

interface ChannelSummary {
  id: string;
  clubId?: string;
  eventId?: string;
  name: string;
  slug?: string;
  kind: 'CLUB' | 'DOUBT' | string;
  unreadCount?: number;
}

interface ClubSummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export const CommunityPage: React.FC = () => {
  const { user, isClubOrganizer, isAdmin } = useAuth();

  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [myClubIds, setMyClubIds] = useState<Set<string>>(new Set());
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [isMobileThreadOpen, setIsMobileThreadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch Clubs and initial Unread Map
  useEffect(() => {
    const fetchClubs = async () => {
      try {
        const [res, myRes] = await Promise.all([
          api.get<{ clubs: ClubSummary[] }>('/clubs', { showToast: false }),
          api.get<{ clubs: Array<{ id: string }> }>('/clubs/me', { showToast: false }).catch(() => ({ clubs: [] })),
        ]);
        const list = res.clubs || [];
        const memberIds = new Set((myRes.clubs || []).map((c) => c.id));
        setMyClubIds(memberIds);
        setClubs(list);
        if (list.length > 0 && !selectedClubId) {
          const preferred = list.find((c) => memberIds.has(c.id)) || list[0];
          if (preferred) {
            setSelectedClubId(preferred.id);
          }
        }
      } catch {
        setClubs([]);
        setSelectedClubId(null);
      }
    };

    const fetchUnread = async () => {
      try {
        const res = await api.get<{ unread: Record<string, number> }>('/me/unread', {
          showToast: false,
        });
        if (res && res.unread) {
          setUnreadMap(res.unread);
        }
      } catch {
        // Ignore unread fetch error
      }
    };

    void fetchClubs();
    void fetchUnread();
  }, []);

  // 2. Fetch Channels for selected club
  useEffect(() => {
    if (!selectedClubId) return;

    const fetchChannels = async () => {
      setIsLoading(true);
      try {
        const res = await api.get<{ channels: ChannelSummary[] }>(
          `/clubs/${selectedClubId}/channels`,
          { showToast: false }
        );
        const list = res?.channels || [];
        setChannels(list);
        if (list.length > 0) {
          if (!activeChannelId || !list.some((c) => c.id === activeChannelId)) {
            setActiveChannelId(list[0]!.id);
          }
        } else {
          setActiveChannelId(null);
        }
      } catch {
        setChannels([]);
        setActiveChannelId(null);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchChannels();
  }, [selectedClubId, activeChannelId]);

  // 3. Listen to socket message and read events to update unread counters
  useEffect(() => {
    const handleIncomingMessage = (payload: { channelId: string }) => {
      if (payload.channelId !== activeChannelId) {
        setUnreadMap((prev) => ({
          ...prev,
          [payload.channelId]: (prev[payload.channelId] || 0) + 1,
        }));
      }
    };

    const handleReadReceipt = (payload: { channelId: string; userId: string }) => {
      if (payload.userId === user?.id) {
        setUnreadMap((prev) => ({
          ...prev,
          [payload.channelId]: 0,
        }));
      }
    };

    socket.on('chat:message', handleIncomingMessage);
    socket.on('chat:read', handleReadReceipt);

    return () => {
      socket.off('chat:message', handleIncomingMessage);
      socket.off('chat:read', handleReadReceipt);
    };
  }, [activeChannelId, user?.id]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0];

  // Determine channel icon and read-only status
  const getChannelIcon = (name: string, kind: string) => {
    if (kind === 'DOUBT') return Sparkles;
    if (name.includes('announcements')) return Megaphone;
    if (name.includes('events')) return Calendar;
    return Hash;
  };

  const isChannelReadOnly = (channel?: ChannelSummary) => {
    if (!channel) return false;
    // System feed #events is always read-only
    if (channel.name === 'events') return true;
    // #announcements is read-only for regular members (requires admin or organizer)
    if (channel.name === 'announcements' && !isClubOrganizer && !isAdmin) {
      return true;
    }
    return false;
  };

  const handleSelectChannel = (id: string) => {
    setActiveChannelId(id);
    setIsMobileThreadOpen(true);
    // Clear unread count for this channel
    setUnreadMap((prev) => ({
      ...prev,
      [id]: 0,
    }));
  };

  return (
    <div className="container max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6 h-[calc(100vh-5rem)] min-h-[580px] flex flex-col">
      {/* Community Header */}
      <div className="flex items-center justify-between pb-3 px-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Club Spaces
          </h1>
          <Badge variant="outline" className="text-xs border-indigo-500/40 text-indigo-400">
            Realtime
          </Badge>
        </div>

        {clubs.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-xs sm:max-w-md">
            {clubs.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={selectedClubId === c.id ? 'default' : 'outline'}
                onClick={() => setSelectedClubId(c.id)}
                className="text-xs h-8 rounded-full"
              >
                {c.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Main Split Pane Container (WhatsApp Desktop Split / Mobile Stacked) */}
      <Card className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden border-border/80 shadow-xl bg-card rounded-2xl">
        {/* Left Pane: Channels list (Hidden on mobile if thread open) */}
        <div
          className={`${
            isMobileThreadOpen ? 'hidden md:flex' : 'flex'
          } md:col-span-4 lg:col-span-3 flex-col border-r border-border/60 bg-muted/20 h-full overflow-hidden`}
        >
          {/* Club Info Strip */}
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2 truncate">
              <div className="h-9 w-9 rounded-xl bg-indigo-600/15 text-indigo-500 flex items-center justify-center font-black text-sm shrink-0">
                {clubs.find((c) => c.id === selectedClubId)?.name.charAt(0) || 'C'}
              </div>
              <div className="truncate">
                <h3 className="font-bold text-sm text-foreground truncate">
                  {clubs.find((c) => c.id === selectedClubId)?.name || 'Campus Club'}
                </h3>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Community Hub
                </span>
              </div>
            </div>
          </div>

          {/* Channels List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Channels
            </div>

            {isLoading ? (
              <div className="p-4 space-y-2">
                <div className="h-10 bg-muted/40 rounded-xl animate-pulse" />
                <div className="h-10 bg-muted/40 rounded-xl animate-pulse" />
                <div className="h-10 bg-muted/40 rounded-xl animate-pulse" />
              </div>
            ) : channels.length === 0 ? (
              <div className="p-6 text-center space-y-1.5" data-testid="empty-channels-state">
                <p className="text-xs font-semibold text-muted-foreground">No channels available</p>
                <p className="text-[11px] text-muted-foreground/70">
                  This club does not have any active channels yet.
                </p>
              </div>
            ) : (
              channels.map((chan) => {
                const IconComponent = getChannelIcon(chan.name, chan.kind);
                const isActive = activeChannel?.id === chan.id;
                const unread = unreadMap[chan.id] || 0;

                return (
                  <button
                    key={chan.id}
                    type="button"
                    onClick={() => handleSelectChannel(chan.id)}
                    data-testid={`channel-item-${chan.name}`}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-foreground/80 hover:bg-muted/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <IconComponent
                        className={`h-4 w-4 shrink-0 ${
                          isActive
                            ? 'text-white'
                            : chan.kind === 'DOUBT'
                            ? 'text-violet-400'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className="truncate">#{chan.name}</span>
                    </div>

                    {unread > 0 && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          isActive
                            ? 'bg-white text-indigo-700'
                            : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {unread}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Virtualized Chat Thread (Full screen on mobile when open) */}
        <div
          className={`${
            isMobileThreadOpen ? 'flex' : 'hidden md:flex'
          } md:col-span-8 lg:col-span-9 flex-col h-full bg-background overflow-hidden relative`}
        >
          {/* Mobile Back Button to Channels List */}
          <div className="md:hidden flex items-center gap-2 p-2 bg-slate-900 border-b border-slate-800 text-white">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileThreadOpen(false)}
              className="text-white hover:bg-slate-800 gap-1 h-8 px-2 font-semibold text-xs"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Channels</span>
            </Button>
            <span className="font-bold text-sm">#{activeChannel?.name || 'chat'}</span>
          </div>

          {!isAdmin && user?.role !== 'FACULTY' && selectedClubId && !myClubIds.has(selectedClubId) ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-3">
              <Users className="h-12 w-12 text-muted-foreground/60" />
              <p className="font-bold text-base text-foreground">Club Membership Required</p>
              <p className="text-xs max-w-sm">
                You are viewing a club you have not joined yet. Request an invite or reach out to a club lead to participate in chat discussions.
              </p>
            </div>
          ) : activeChannel ? (
            <ChatThread
              key={activeChannel.id}
              channelId={activeChannel.id}
              channelName={activeChannel.name}
              channelKind={activeChannel.kind}
              isReadOnly={isChannelReadOnly(activeChannel)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-2">
              <Compass className="h-10 w-10 text-muted-foreground/60" />
              <p className="font-bold text-base">Select a Channel</p>
              <p className="text-xs">Choose a channel from the left sidebar to start messaging.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default CommunityPage;
