import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { SeatPill } from '@/components/primitives/seat-pill';
import { POSTER_CARD_HEIGHT_CLASSES } from '@/components/primitives/skeleton-card';
import { useSeats } from '@/lib/socket';
import { Calendar, MapPin, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EventCardData {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  category: string;
  bannerUrl?: string | null;
  startAt: string;
  endAt?: string;
  venue?: string | null;
  pricePaise?: number | null;
  capacity: number;
  seatsRemaining: number;
  clubName?: string;
  clubLogoUrl?: string | null;
}

export const EventCard: React.FC<{ event: EventCardData; className?: string }> = ({
  event,
  className,
}) => {
  // Live socket updates for this event
  const socketSeats = useSeats(event.id);
  const remaining = socketSeats.remaining ?? event.seatsRemaining ?? 0;
  const capacity = socketSeats.capacity ?? event.capacity ?? 100;

  const startDate = new Date(event.startAt);
  const formattedDate = startDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const priceText =
    !event.pricePaise || event.pricePaise === 0
      ? 'Free'
      : `₹${(event.pricePaise / 100).toFixed(2)}`;

  return (
    <Card
      data-testid="event-card"
      className={cn(
        'group flex flex-col overflow-hidden hover:shadow-lg transition-all duration-200 border-border',
        POSTER_CARD_HEIGHT_CLASSES,
        className
      )}
    >
      <Link
        to={`/events/${event.slug || event.id}`}
        className="block relative aspect-video w-full shrink-0 bg-slate-900 overflow-hidden"
      >
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-slate-950 flex flex-col items-center justify-center p-4 text-center">
            <span className="text-xs font-semibold tracking-wider text-indigo-400 uppercase">
              {event.category}
            </span>
            <p className="mt-1 text-sm font-bold text-white line-clamp-2 px-2">
              {event.title}
            </p>
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-black/60 text-white backdrop-blur-md">
            {event.category}
          </span>
        </div>
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-600 text-white shadow-sm tnum">
            {priceText}
          </span>
        </div>
      </Link>

      <CardHeader className="p-4 pb-2 space-y-1.5 flex-1">
        <div className="flex items-center text-xs text-muted-foreground gap-1.5 tnum">
          <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>{formattedDate}</span>
        </div>

        <Link
          to={`/events/${event.slug || event.id}`}
          className="font-bold text-base line-clamp-2 group-hover:text-primary transition-colors leading-snug"
        >
          {event.title}
        </Link>

        {event.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {event.description}
          </p>
        )}
      </CardHeader>

      <CardContent className="p-4 pt-0 pb-3">
        {event.venue && (
          <div className="flex items-center text-xs text-muted-foreground gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{event.venue}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0 mt-auto flex items-center justify-between border-t border-border/40 pt-3">
        <div className="flex items-center gap-2 truncate">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
            {(event.clubName || 'C')[0]}
          </div>
          <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
            {event.clubName || 'Campus Club'}
          </span>
        </div>

        <SeatPill remaining={remaining} capacity={capacity} />
      </CardFooter>
    </Card>
  );
};
