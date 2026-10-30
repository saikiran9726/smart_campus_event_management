import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChatThread } from './ChatThread';
import { ChevronLeft, Sparkles, AlertCircle } from 'lucide-react';

interface DoubtRoomData {
  channel: {
    id: string;
    name: string;
    kind: string;
  };
  event: {
    id: string;
    title: string;
    slug?: string;
  };
}

export const EventDoubtRoomPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const [doubtData, setDoubtData] = useState<DoubtRoomData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    const loadDoubtRoom = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Look up event by slug first
        const eventRes = await api.get<{ event: { id: string; title: string; slug: string } }>(
          `/events/${slug}`,
          { showToast: false }
        );

        if (!eventRes?.event?.id) {
          throw new Error('Event not found');
        }

        const eventId = eventRes.event.id;
        const doubtRes = await api.get<any>(`/events/${eventId}/doubt-room`, {
          showToast: false,
        });

        if (doubtRes && doubtRes.channel) {
          setDoubtData({
            channel: doubtRes.channel,
            event: eventRes.event,
          });
        } else {
          throw new Error('Doubt room could not be resolved.');
        }
      } catch (err: any) {
        setError(err.message || 'Access restricted. You must be registered for this event to access the doubt room.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadDoubtRoom();
  }, [slug]);

  return (
    <div className="container max-w-5xl mx-auto px-3 sm:px-6 py-6 h-[calc(100vh-5rem)] min-h-[580px] flex flex-col space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <Link
          to={`/events/${slug || ''}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back to Event</span>
        </Link>

        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/30 text-xs font-bold">
            Live Doubt Room
          </Badge>
        </div>
      </div>

      {/* Main chat card */}
      <Card className="flex-1 overflow-hidden border-border/80 shadow-2xl bg-card rounded-2xl flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground animate-pulse">
            Connecting to event doubt room...
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md mx-auto">
            <AlertCircle className="h-12 w-12 text-rose-500" />
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground">Access Restricted</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Link to={`/events/${slug || ''}`}>
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                View Event Page & Register
              </Button>
            </Link>
          </div>
        ) : doubtData ? (
          <ChatThread
            key={doubtData.channel.id}
            channelId={doubtData.channel.id}
            channelName={doubtData.channel.name}
            channelKind="DOUBT"
            eventInfo={{
              title: doubtData.event.title,
              slug: doubtData.event.slug,
            }}
          />
        ) : null}
      </Card>
    </div>
  );
};

export default EventDoubtRoomPage;
