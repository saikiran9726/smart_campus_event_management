import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Settings,
  Calendar,
  AlertTriangle,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  CreditCard,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export interface InAppNotification {
  id: string;
  eventId?: string | null;
  eventTitle?: string | null;
  kind: string;
  channel: string;
  status: string;
  payload: {
    title?: string;
    message?: string;
    read?: boolean;
    createdAt?: string;
    ticketToken?: string;
    amount?: number;
    teamName?: string;
    [key: string]: any;
  };
  runAt: string;
  sentAt?: string | null;
}

export interface UserPreferences {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  whatsappEnabled: boolean;
  eventReminders: boolean;
  registrationUpdates: boolean;
  teamUpdates: boolean;
  announcements: boolean;
  volunteerUpdates?: boolean;
  whatsappConsentAt?: string | null;
  whatsappConsentWithdrawnAt?: string | null;
}

const fallbackQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export const NotificationBellInner: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [prefsOpen, setPrefsOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 1. Fetch user notifications with periodic refetch
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: async () => {
      return await api.get<{
        notifications: InAppNotification[];
        unreadCount: number;
      }>('/me/notifications', { showToast: false });
    },
    refetchInterval: 30000, // Refetch every 30s
  });

  // 2. Fetch user notification preferences
  const { data: prefData } = useQuery({
    queryKey: ['me', 'notification-preferences'],
    queryFn: async () => {
      const res = await api.get<{ preferences: UserPreferences }>(
        '/me/notification-preferences',
        { showToast: false }
      );
      return res.preferences;
    },
    enabled: prefsOpen,
  });

  const [preferences, setPreferences] = useState<UserPreferences>({
    emailEnabled: true,
    inAppEnabled: true,
    whatsappEnabled: false,
    eventReminders: true,
    registrationUpdates: true,
    teamUpdates: true,
    announcements: true,
  });

  React.useEffect(() => {
    if (prefData) {
      setPreferences(prefData);
    }
  }, [prefData]);

  // 3. Mark single notification as read mutation
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.post(`/me/notifications/${id}/read`, {}, { showToast: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] });
    },
  });

  // 4. Mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/me/notifications/read-all', {}, { showToast: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] });
      toast({
        title: 'All notifications marked as read',
      });
    },
  });

  // 5. Save preferences mutation
  const savePrefsMutation = useMutation({
    mutationFn: async (updated: Partial<UserPreferences>) => {
      return await api.patch<{ success: boolean; preferences: UserPreferences }>(
        '/me/notification-preferences',
        updated
      );
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['me', 'notification-preferences'], res.preferences);
      toast({
        title: 'Preferences saved',
        description: 'Your notification channels and settings have been updated.',
      });
      setPrefsOpen(false);
    },
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;


  const groupNotifications = (items: InAppNotification[]) => {
    const today: InAppNotification[] = [];
    const yesterday: InAppNotification[] = [];
    const older: InAppNotification[] = [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;

    for (const item of items) {
      const timeVal = new Date(item.runAt || item.sentAt || item.payload?.createdAt || Date.now()).getTime();
      if (timeVal >= startOfToday) {
        today.push(item);
      } else if (timeVal >= startOfYesterday) {
        yesterday.push(item);
      } else {
        older.push(item);
      }
    }
    return [
      { label: 'Today', items: today },
      { label: 'Yesterday', items: yesterday },
      { label: 'Older', items: older },
    ].filter((g) => g.items.length > 0);
  };

  const filteredNotifications = notifications.filter((item) => {
    if (filter === 'UNREAD') {
      return item.status !== 'READ' && !item.payload?.read;
    }
    return true;
  });

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case 'BOOKING_CONFIRMED':
      case 'REGISTRATION_APPROVED':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'REGISTRATION_REJECTED':
      case 'REGISTRATION_CANCELLED':
      case 'PAYMENT_FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'PAYMENT_SUCCESS':
        return <CreditCard className="h-4 w-4 text-blue-500" />;
      case 'REMINDER_24H':
      case 'REMINDER_2H':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'TEAM_INVITATION':
        return <Users className="h-4 w-4 text-purple-500" />;
      case 'WAITLIST_OFFER':
        return <Sparkles className="h-4 w-4 text-indigo-500" />;
      default:
        return <Calendar className="h-4 w-4 text-indigo-500" />;
    }
  };

  const handleNotificationClick = (item: InAppNotification) => {
    if (item.status !== 'READ') {
      markReadMutation.mutate(item.id);
    }
    setOpen(false);

    if (item.kind === 'BOOKING_CONFIRMED') {
      navigate('/passport');
    } else if (item.eventId) {
      navigate(`/events/${item.eventId}`);
    }
  };

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 rounded-full focus-ring"
            aria-label={`Notifications (${unreadCount} unread)`}
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1.5 flex items-center justify-center text-[11px] font-bold rounded-full animate-in zoom-in"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-80 sm:w-96 p-0 shadow-lg border border-border rounded-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {unreadCount} unread
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-full"
                onClick={() => {
                  setOpen(false);
                  setPrefsOpen(true);
                }}
                title="Notification Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-background text-xs">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                filter === 'ALL'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('UNREAD')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                filter === 'UNREAD'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Loading notifications...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-foreground">No notifications</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filter === 'UNREAD'
                    ? 'You have caught up with all updates!'
                    : 'Important announcements and alerts will appear here.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const isUnread = item.status !== 'READ' && !item.payload?.read;
                const title = item.payload?.title || item.eventTitle || 'Campus Notice';
                const message = item.payload?.message || '';
                const timeStr = formatRelativeTime(item.runAt || item.sentAt || undefined);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={cn(
                      'flex items-start gap-3 p-3 text-left cursor-pointer transition-colors hover:bg-muted/60',
                      isUnread && 'bg-primary/5'
                    )}
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg bg-background border border-border shadow-xs shrink-0">
                      {getKindIcon(item.kind)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cn('text-xs font-medium truncate', isUnread && 'font-semibold text-foreground')}>
                          {title}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeStr}</span>
                      </div>
                      {message && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {message}
                        </p>
                      )}
                    </div>

                    {isUnread && (
                      <span className="h-2 w-2 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Notification Preferences Dialog */}
      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Notification Preferences</DialogTitle>
            <DialogDescription>
              Choose which channels and campus alerts you want to receive.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Delivery Channels
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pref-email">Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">Receive tickets, receipts and calendar .ics</p>
                  </div>
                  <Switch
                    id="pref-email"
                    checked={preferences.emailEnabled}
                    onCheckedChange={(checked) =>
                      setPreferences((p) => ({ ...p, emailEnabled: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pref-inapp">In-App Notifications</Label>
                    <p className="text-xs text-muted-foreground">Alerts in top navigation bell</p>
                  </div>
                  <Switch
                    id="pref-inapp"
                    checked={preferences.inAppEnabled}
                    onCheckedChange={(checked) =>
                      setPreferences((p) => ({ ...p, inAppEnabled: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pref-whatsapp">WhatsApp Alerts</Label>
                    <p className="text-xs text-muted-foreground">Quick mobile updates for confirmed events</p>
                  </div>
                  <Switch
                    id="pref-whatsapp"
                    checked={preferences.whatsappEnabled}
                    onCheckedChange={(checked) =>
                      setPreferences((p) => ({ ...p, whatsappEnabled: checked }))
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Alert Categories
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pref-reminders">Event Reminders (24h & 2h)</Label>
                    <p className="text-xs text-muted-foreground">Gate info and venue instructions</p>
                  </div>
                  <Switch
                    id="pref-reminders"
                    checked={preferences.eventReminders}
                    onCheckedChange={(checked) =>
                      setPreferences((p) => ({ ...p, eventReminders: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pref-reg">Registration & Payments</Label>
                    <p className="text-xs text-muted-foreground">Approvals, rejections, cancellations, receipts</p>
                  </div>
                  <Switch
                    id="pref-reg"
                    checked={preferences.registrationUpdates}
                    onCheckedChange={(checked) =>
                      setPreferences((p) => ({ ...p, registrationUpdates: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pref-team">Team Invitations & Updates</Label>
                    <p className="text-xs text-muted-foreground">Invites to form or join hackathon teams</p>
                  </div>
                  <Switch
                    id="pref-team"
                    checked={preferences.teamUpdates}
                    onCheckedChange={(checked) =>
                      setPreferences((p) => ({ ...p, teamUpdates: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pref-ann">Organizer Announcements</Label>
                    <p className="text-xs text-muted-foreground">Broadcast messages from event coordinators</p>
                  </div>
                  <Switch
                    id="pref-ann"
                    checked={preferences.announcements}
                    onCheckedChange={(checked) =>
                      setPreferences((p) => ({ ...p, announcements: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pref-vol">Volunteer Assignments & Duty</Label>
                    <p className="text-xs text-muted-foreground">Gate assignments, shift reminders and passkeys</p>
                  </div>
                  <Switch
                    id="pref-vol"
                    checked={preferences.volunteerUpdates ?? true}
                    onCheckedChange={(checked) =>
                      setPreferences((p) => ({ ...p, volunteerUpdates: checked }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPrefsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => savePrefsMutation.mutate(preferences)}
              disabled={savePrefsMutation.isPending}
            >
              {savePrefsMutation.isPending ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const NotificationBell: React.FC = (props) => {
  let hasClient = false;
  try {
    hasClient = !!useQueryClient();
  } catch {
    hasClient = false;
  }

  if (!hasClient) {
    return (
      <QueryClientProvider client={fallbackQueryClient}>
        <NotificationBellInner {...props} />
      </QueryClientProvider>
    );
  }

  return <NotificationBellInner {...props} />;
};
