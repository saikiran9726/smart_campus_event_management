import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Hash, Users, Sparkles } from 'lucide-react';
import { SkeletonChatBubble } from '@/components/primitives/skeleton-card';

export const CommunityPage: React.FC = () => {
  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels', 'list'],
    queryFn: async () => {
      try {
        const res = await api.get<{ channels: Record<string, unknown>[] }>('/channels', {
          showToast: false,
        });
        return res.channels || [];
      } catch {
        return [];
      }
    },
  });

  return (
    <div className="container max-w-6xl px-4 sm:px-8 py-8 mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Community Channels</h1>
        <p className="text-muted-foreground text-sm">
          Club broadcasts, event doubt rooms, and live interactive attendee channels.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Channels List */}
        <Card className="border-border md:col-span-1 p-4 space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Channels
          </h2>
          <div className="space-y-1">
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary/10 text-primary">
              <Hash className="h-4 w-4" />
              <span>announcements</span>
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted">
              <Hash className="h-4 w-4" />
              <span>general</span>
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <span>doubt-room</span>
            </button>
          </div>
        </Card>

        {/* Chat Feed */}
        <Card className="border-border md:col-span-3 flex flex-col h-[500px]">
          <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-indigo-500" />
              <CardTitle className="text-base font-bold">announcements</CardTitle>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>124 campus members</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-4 overflow-y-auto space-y-4">
            <SkeletonChatBubble />
            <SkeletonChatBubble isSender />
            <div className="p-4 rounded-xl bg-muted/40 text-xs text-muted-foreground text-center">
              Live Socket.IO chat engine connected. Prompt 15 will hydrate real-time messages.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CommunityPage;
