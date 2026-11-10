import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewFormModal } from '../features/event/ReviewFormModal';
import { ReviewsSummary } from '../features/event/ReviewsSummary';
import { api } from '../lib/api';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_student_test',
      fullName: 'Sam Student',
      email: 'sam@campus.edu',
      role: 'STUDENT',
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: false,
    hasRole: () => true,
    signOut: vi.fn(),
  }),
}));

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('Area 2: Reviews UI Components and Flow', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createClient();
    vi.clearAllMocks();
  });

  it('renders ReviewFormModal with event and club star selectors and submits review', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      review: { id: 'rev_123', stars: 5, comment: 'Awesome workshop!' },
    } as any);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <ReviewFormModal
          isOpen={true}
          onClose={onClose}
          eventId="event_123"
          eventTitle="Cloud Native Bootcamp"
          clubName="Cloud Computing Club"
          onSuccess={onSuccess}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText(/Rate Event & Organizing Club/i)).toBeInTheDocument();
    expect(screen.getByText(/Cloud Native Bootcamp/i)).toBeInTheDocument();

    // Select 5 stars for event
    const fiveStarBtn = screen.getByRole('button', { name: '5 stars' });
    fireEvent.click(fiveStarBtn);

    // Fill in comment
    const commentInput = screen.getByPlaceholderText(/What did you learn or enjoy most about this event\?/i);
    fireEvent.change(commentInput, { target: { value: 'Awesome workshop!' } });

    // Submit review
    const submitBtn = screen.getByRole('button', { name: /Submit Review/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/events/event_123/reviews',
        expect.objectContaining({
          stars: 5,
          comment: 'Awesome workshop!',
        })
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('renders ReviewsSummary with histogram and opens Report Review dialog', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ success: true } as any);

    const mockReviews = [
      {
        id: 'rev_abc',
        stars: 5,
        comment: 'Outstanding presentation and speakers!',
        authorName: 'Alex Attendee',
        createdAt: new Date().toISOString(),
        clubStars: 5,
        clubComment: 'Very helpful organizers.',
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <ReviewsSummary
          average={4.5}
          count={2}
          histogram={{ 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 }}
          reviews={mockReviews}
          canReview={false}
          onOpenReviewModal={vi.fn()}
        />
      </QueryClientProvider>
    );

    // Summary heading and stars
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText(/Based on 2 attendees/i)).toBeInTheDocument();
    expect(screen.getByText(/"Outstanding presentation and speakers!"/i)).toBeInTheDocument();
    expect(screen.getByText('Alex Attendee')).toBeInTheDocument();

    // Open Report dialog
    const reportBtn = screen.getByRole('button', { name: /Report review/i });
    fireEvent.click(reportBtn);

    expect(screen.getByText('Report Review')).toBeInTheDocument();

    const reportReason = screen.getByPlaceholderText(/Spam, harassment, hate speech, inappropriate language\.\.\./i);
    fireEvent.change(reportReason, { target: { value: 'Inappropriate language.' } });

    const submitReportBtn = screen.getByRole('button', { name: /Submit Report/i });
    fireEvent.click(submitReportBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/reviews/rev_abc/report', {
        reason: 'Inappropriate language.',
      });
    });
  });
});
