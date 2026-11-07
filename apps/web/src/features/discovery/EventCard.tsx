import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/shared/Card';
import { Badge, StatusPill } from '@/components/shared/Badge';
import { useSeats } from '@/lib/socket';
import { Calendar, MapPin, Users, Ticket } from 'lucide-react';
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
  registrationMode?: 'INDIVIDUAL' | 'TEAM' | 'BOTH' | string;
  minTeamSize?: number;
  maxTeamSize?: number;
  isCompetition?: boolean;
}

export const EventCard: React.FC<{ event: EventCardData; className?: string }> = ({
  event,
  className,
}) => {
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

  const isFree = !event.pricePaise || event.pricePaise === 0;
  const priceText = isFree ? 'Free' : `₹${(event.pricePaise! / 100).toFixed(0)}`;
  const isSoldOut = remaining <= 0;
  const isTeamEvent = Boolean(
    event.isCompetition ||
    event.registrationMode === 'TEAM' ||
    event.registrationMode === 'BOTH' ||
    (event.minTeamSize && event.minTeamSize > 1)
  );

  return (
    <Card
      data-testid="event-card"
      className={cn(
        'group flex flex-col overflow-hidden hover:shadow-md transition-all duration-200 border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-left',
        className
      )}
    >
      {/* Banner / Poster Section */}
      <Link
        to={`/events/${event.slug || event.id}`}
        className="block relative aspect-video w-full shrink-0 bg-stone-100 dark:bg-stone-800 overflow-hidden"
      >
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-stone-100 dark:bg-stone-800 flex flex-col items-center justify-center p-4 text-center border-b border-stone-200 dark:border-stone-800">
            <span className="text-[11px] font-bold tracking-wider text-teal-700 dark:text-teal-400 uppercase">
              {event.category}
            </span>
            <p className="mt-1 font-heading text-sm font-bold text-stone-900 dark:text-stone-100 line-clamp-2 px-2">
              {event.title}
            </p>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-stone-900/80 text-white backdrop-blur-none select-none">
            {event.category}
          </span>
          {isTeamEvent && (
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 text-stone-900 shadow-sm select-none flex items-center gap-1">
              <Users className="h-3 w-3 stroke-[2]" />
              <span>Team {event.minTeamSize || 2}-{event.maxTeamSize || 4}</span>
            </span>
          )}
        </div>

        <div className="absolute top-2.5 right-2.5">
          <span
            className={cn(
              'px-2.5 py-0.5 rounded text-xs font-bold tnum shadow-sm select-none',
              isFree ? 'bg-emerald-700 text-white' : 'bg-teal-700 text-white'
            )}
          >
            {priceText}
          </span>
        </div>
      </Link>

      {/* Content Section */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center text-xs text-stone-500 dark:text-stone-400 gap-1.5 tnum font-medium">
            <Calendar className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400 shrink-0 stroke-[1.75]" />
            <span>{formattedDate}</span>
          </div>

          <Link
            to={`/events/${event.slug || event.id}`}
            className="font-heading font-bold text-base text-stone-900 dark:text-stone-100 line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors leading-snug"
          >
            {event.title}
          </Link>

          {event.description && (
            <p className="text-xs text-stone-600 dark:text-stone-400 line-clamp-2 leading-relaxed">
              {event.description}
            </p>
          )}
        </div>

        {/* Footer Chips */}
        <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400 truncate">
            {event.venue && (
              <span className="flex items-center gap-1 truncate max-w-[140px]">
                <MapPin className="h-3 w-3 text-stone-400 shrink-0 stroke-[1.75]" />
                <span className="truncate">{event.venue}</span>
              </span>
            )}
          </div>

          <div>
            {isSoldOut ? (
              <Badge variant="danger" size="sm">Sold Out</Badge>
            ) : remaining < 15 ? (
              <Badge variant="warning" size="sm" leftDot>Only {remaining} left</Badge>
            ) : (
              <Badge variant="success" size="sm" leftDot>{remaining} seats</Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
