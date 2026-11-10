import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/shared/Card';
import { Users, Star, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ClubCardProps {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  memberCount?: number;
  averageRating?: number | null;
  reviewCount?: number;
  className?: string;
}

export const ClubCard: React.FC<{ club: ClubCardProps; className?: string }> = ({
  club,
  className,
}) => {
  const hasRating =
    club.averageRating !== null &&
    club.averageRating !== undefined &&
    club.reviewCount !== undefined &&
    club.reviewCount > 0;

  return (
    <Card
      data-testid="club-card"
      className={cn(
        'group flex flex-col justify-between overflow-hidden p-5 border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:shadow-md transition-all text-left',
        className
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          {club.logoUrl ? (
            <img
              src={club.logoUrl}
              alt={club.name}
              className="h-12 w-12 rounded-xl object-cover shrink-0 border border-stone-100 dark:border-stone-800"
            />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 font-extrabold flex items-center justify-center text-lg shrink-0 border border-teal-200/50 dark:border-teal-800/40">
              {club.name[0] || 'C'}
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-0.5">
            <Link
              to={`/clubs/${club.slug || club.id}`}
              className="font-heading font-bold text-base text-stone-900 dark:text-stone-100 hover:text-teal-700 dark:hover:text-teal-400 transition-colors line-clamp-1"
            >
              {club.name}
            </Link>

            {hasRating ? (
              <div className="flex items-center gap-1.5 text-xs" data-testid="club-card-rating">
                <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 stroke-[1.5]" />
                  <span>{club.averageRating!.toFixed(1)}</span>
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400">
                  ({club.reviewCount} {club.reviewCount === 1 ? 'review' : 'reviews'})
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-stone-400">No reviews yet</span>
            )}
          </div>
        </div>

        {club.description && (
          <p className="text-xs text-stone-600 dark:text-stone-400 line-clamp-2 leading-relaxed">
            {club.description}
          </p>
        )}
      </div>

      <div className="pt-3 mt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between text-xs">
        {club.memberCount !== undefined && club.memberCount !== null && (
          <span className="flex items-center gap-1 text-stone-500 text-[11px]">
            <Users className="h-3 w-3 stroke-[1.75]" />
            <span>{club.memberCount} members</span>
          </span>
        )}

        <Link
          to={`/clubs/${club.slug || club.id}`}
          className="text-xs font-semibold text-teal-700 dark:text-teal-400 group-hover:underline inline-flex items-center gap-1 ml-auto"
        >
          <span>View Club</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
};
