import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/shared/Badge';
import { toast } from '@/components/ui/use-toast';
import {
  Star,
  Users,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Flag,
  MessageSquare,
  ShieldCheck,
  Building,
} from 'lucide-react';

interface PublicClubReview {
  id: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  stars: number;
  comment?: string | null;
  authorName: string;
  isVerifiedAttendee: boolean;
  createdAt: string;
}

interface ClubReviewsResponse {
  club: {
    id: string;
    name: string;
    slug: string;
  };
  clubAverage: number;
  count: number;
  histogram: Record<number, number>;
  reviews: PublicClubReview[];
  nextCursor?: string | null;
}

interface ClubDetailsResponse {
  club: {
    id: string;
    name: string;
    slug: string;
    description: string;
    logoKey?: string | null;
    bannerKey?: string | null;
    memberCount?: number;
    averageRating?: number | null;
    reviewCount?: number;
    facultyCoordinatorId?: string | null;
    createdAt: string;
  };
}

export const ClubPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();

  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);

  // 1. Fetch Club Details
  const {
    data: clubData,
    isLoading: isClubLoading,
    isError: isClubError,
  } = useQuery<ClubDetailsResponse>({
    queryKey: ['clubs', slug],
    queryFn: async () => {
      return await api.get<ClubDetailsResponse>(`/clubs/${slug}`);
    },
    enabled: Boolean(slug),
  });

  // 2. Fetch Public Club Reviews (Logged-out visible)
  const {
    data: reviewsData,
    isLoading: isReviewsLoading,
  } = useQuery<ClubReviewsResponse>({
    queryKey: ['public', 'clubs', slug, 'reviews'],
    queryFn: async () => {
      return await api.get<ClubReviewsResponse>(`/public/clubs/${slug}/reviews`);
    },
    enabled: Boolean(slug),
  });

  // 3. Report Review Abuse
  const reportMutation = useMutation({
    mutationFn: async ({ reviewId, reason }: { reviewId: string; reason: string }) => {
      return await api.post(`/reviews/${reviewId}/report`, { reason });
    },
    onSuccess: () => {
      toast.success('Review reported for administrative moderation.');
      setReportingReviewId(null);
      void queryClient.invalidateQueries({ queryKey: ['public', 'clubs', slug, 'reviews'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to report review.');
    },
  });

  const club = clubData?.club;
  const reviews = reviewsData?.reviews || [];
  const averageRating = reviewsData?.clubAverage ?? club?.averageRating ?? 0;
  const reviewCount = reviewsData?.count ?? club?.reviewCount ?? 0;
  const histogram = reviewsData?.histogram || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  if (isClubLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-6 animate-pulse">
        <div className="h-40 bg-stone-100 dark:bg-stone-800 rounded-2xl" />
        <div className="h-8 w-64 bg-stone-200 dark:bg-stone-700 rounded" />
        <div className="h-32 bg-stone-100 dark:bg-stone-800 rounded-xl" />
      </div>
    );
  }

  if (isClubError || !club) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <Building className="h-12 w-12 text-stone-400 mx-auto" />
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Club Not Found</h2>
        <p className="text-xs text-stone-500">The requested campus organization could not be located.</p>
        <Button variant="outline" onClick={() => navigate('/')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Discover</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 text-left" data-testid="public-club-page">
      {/* Navigation & Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>

        <div className="p-6 sm:p-8 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="h-20 w-20 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 font-extrabold flex items-center justify-center text-3xl shrink-0 border border-teal-200/60 dark:border-teal-800/40 shadow-xs">
              {club.name[0]}
            </div>

            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
                  {club.name}
                </h1>
                <Badge variant="neutral" size="sm">
                  Campus Organization
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 dark:text-stone-400">
                {club.memberCount !== undefined && (
                  <span className="flex items-center gap-1 font-medium">
                    <Users className="h-3.5 w-3.5 text-stone-400 stroke-[1.75]" />
                    <span>{club.memberCount} members</span>
                  </span>
                )}

                <div className="flex items-center gap-1.5" data-testid="club-header-rating">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500 stroke-[1.5]" />
                  <span className="font-bold text-stone-900 dark:text-stone-100">
                    {averageRating > 0 ? averageRating.toFixed(1) : 'No ratings yet'}
                  </span>
                  {reviewCount > 0 && (
                    <span className="text-stone-500 font-normal">
                      ({reviewCount} verified {reviewCount === 1 ? 'review' : 'reviews'})
                    </span>
                  )}
                </div>
              </div>

              {club.description && (
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 pt-1 leading-relaxed max-w-3xl">
                  {club.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ratings & Reviews Section (Logged-Out Visible) */}
      <div className="space-y-6" data-testid="club-reviews-section">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <span>Public Attendee Reviews & Ratings</span>
            </h2>
            <p className="text-xs text-stone-500">
              Verified attendee evaluations from past campus events and hackathons hosted by this club.
            </p>
          </div>
        </div>

        {/* Reviews Summary Histogram Card */}
        <Card className="p-6 border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Left: Overall Score */}
            <div className="text-center md:text-left space-y-1 md:border-r border-stone-200 dark:border-stone-800 md:pr-6">
              <p className="text-4xl sm:text-5xl font-black text-stone-900 dark:text-stone-100 tracking-tight tnum">
                {averageRating > 0 ? averageRating.toFixed(1) : '—'}
              </p>
              <div className="flex items-center justify-center md:justify-start gap-1 py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${
                      star <= Math.round(averageRating)
                        ? 'fill-amber-500 text-amber-500'
                        : 'text-stone-300 dark:text-stone-700'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-stone-500" data-testid="club-reviews-count-label">
                Based on {reviewCount} verified {reviewCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>

            {/* Right: 1-5 Star Breakdown Bars */}
            <div className="md:col-span-2 space-y-1.5 text-xs">
              {[5, 4, 3, 2, 1].map((s) => {
                const countForStar = histogram[s] || 0;
                const percentage = reviewCount > 0 ? Math.round((countForStar / reviewCount) * 100) : 0;
                return (
                  <div key={s} className="flex items-center gap-2.5">
                    <span className="w-10 text-stone-600 dark:text-stone-400 font-medium shrink-0">
                      {s} ★
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-stone-500 font-mono tnum shrink-0">
                      {countForStar}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Public Reviews Feed */}
        {isReviewsLoading ? (
          <div className="space-y-3 py-6 animate-pulse">
            <div className="h-24 bg-stone-100 dark:bg-stone-800 rounded-xl" />
            <div className="h-24 bg-stone-100 dark:bg-stone-800 rounded-xl" />
          </div>
        ) : reviews.length === 0 ? (
          <Card className="p-8 text-center border-stone-200 dark:border-stone-800 space-y-2">
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              No public reviews yet for this club
            </p>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Reviews submitted by verified attendees will appear here automatically after events conclude.
            </p>
          </Card>
        ) : (
          <div className="space-y-4" data-testid="club-reviews-list">
            {reviews.map((rev) => (
              <Card
                key={rev.id}
                className="p-5 border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-3"
                data-testid={`club-review-item-${rev.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                        {rev.authorName}
                      </span>
                      {rev.isVerifiedAttendee && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded-full border border-teal-200/50 dark:border-teal-800/40">
                          <CheckCircle2 className="h-3 w-3 stroke-[2]" />
                          <span>Verified Attendee</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((st) => (
                        <Star
                          key={st}
                          className={`h-3.5 w-3.5 ${
                            st <= rev.stars
                              ? 'fill-amber-500 text-amber-500'
                              : 'text-stone-300 dark:text-stone-700'
                          }`}
                        />
                      ))}
                      <span className="text-xs font-semibold text-stone-700 dark:text-stone-300 ml-1">
                        ★ {rev.stars}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-400 tnum">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>

                    {isSignedIn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Report this review for community guidelines violation?')) {
                            reportMutation.mutate({ reviewId: rev.id, reason: 'Reported by community member' });
                          }
                        }}
                        className="h-7 w-7 p-0 text-stone-400 hover:text-rose-600"
                        title="Report abuse"
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {rev.comment && (
                  <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed italic">
                    &quot;{rev.comment}&quot;
                  </p>
                )}

                {rev.eventTitle && (
                  <div className="pt-1 text-[11px] text-stone-500 flex items-center gap-1">
                    <span>Reviewed after attending</span>
                    <Link
                      to={`/events/${rev.eventSlug || rev.eventId}`}
                      className="font-medium text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      {rev.eventTitle}
                    </Link>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClubPage;
