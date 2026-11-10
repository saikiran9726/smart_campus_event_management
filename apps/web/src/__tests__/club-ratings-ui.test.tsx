import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ClubCard } from '../features/clubs/ClubCard';
import { ClubPage } from '../features/clubs/ClubPage';
import { api } from '../lib/api';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: false, // Testing logged-out public access
    isLoaded: true,
    user: null,
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: false,
  }),
}));

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('Gap 2: Club Ratings Display & Public Club Page UI', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createClient();
    vi.clearAllMocks();
  });

  it('renders ClubCard with average rating, review count, and link to club page', () => {
    const mockClub = {
      id: 'clb_1',
      name: 'IEEE Student Branch',
      slug: 'ieee-branch',
      description: 'Advancing technology for humanity across campus.',
      memberCount: 42,
      averageRating: 4.8,
      reviewCount: 15,
    };

    render(
      <MemoryRouter>
        <ClubCard club={mockClub} />
      </MemoryRouter>
    );

    expect(screen.getByText('IEEE Student Branch')).toBeInTheDocument();
    expect(screen.getByText('Advancing technology for humanity across campus.')).toBeInTheDocument();
    expect(screen.getByText('42 members')).toBeInTheDocument();
    expect(screen.getByTestId('club-card-rating')).toHaveTextContent('4.8');
    expect(screen.getByTestId('club-card-rating')).toHaveTextContent('15 reviews');

    const link = screen.getByRole('link', { name: /View Club/i });
    expect(link).toHaveAttribute('href', '/clubs/ieee-branch');
  });

  it('renders public ClubPage for logged-out users with histogram and public reviews list', async () => {
    const mockClubDetails = {
      club: {
        id: 'clb_1',
        name: 'Robotics & Automation Society',
        slug: 'robotics-soc',
        description: 'Building autonomous rovers and drones.',
        memberCount: 88,
        averageRating: 4.9,
        reviewCount: 20,
        createdAt: new Date().toISOString(),
      },
    };

    const mockClubReviews = {
      club: {
        id: 'clb_1',
        name: 'Robotics & Automation Society',
        slug: 'robotics-soc',
      },
      clubAverage: 4.9,
      count: 20,
      histogram: { 5: 18, 4: 2, 3: 0, 2: 0, 1: 0 },
      reviews: [
        {
          id: 'rev_1',
          eventId: 'ev_10',
          eventTitle: 'National Robotics Hackathon',
          eventSlug: 'robotics-hack',
          stars: 5,
          comment: 'Best collegiate tech society on campus with top tier mentorship!',
          authorName: 'Alex Builder',
          isVerifiedAttendee: true,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/public/clubs/robotics-soc/reviews')) {
        return mockClubReviews as any;
      }
      if (url.includes('/clubs/robotics-soc')) {
        return mockClubDetails as any;
      }
      return {} as any;
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/clubs/robotics-soc']}>
          <Routes>
            <Route path="/clubs/:slug" element={<ClubPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify Club Details Header
    expect(await screen.findByRole('heading', { name: 'Robotics & Automation Society' })).toBeInTheDocument();
    expect(screen.getByText('88 members')).toBeInTheDocument();
    expect(screen.getByTestId('club-header-rating')).toHaveTextContent('4.9');
    expect(screen.getByTestId('club-header-rating')).toHaveTextContent('20 verified reviews');

    // Verify Histogram & Reviews Summary
    expect(screen.getByTestId('club-reviews-count-label')).toHaveTextContent('Based on 20 verified reviews');
    expect(screen.getByText('5 ★')).toBeInTheDocument();

    // Verify Public Reviews List
    expect(await screen.findByTestId('club-review-item-rev_1')).toBeInTheDocument();
    expect(screen.getByText('Alex Builder')).toBeInTheDocument();
    expect(screen.getByText('Verified Attendee')).toBeInTheDocument();
    expect(screen.getByText(/"Best collegiate tech society on campus with top tier mentorship!"/)).toBeInTheDocument();
    expect(screen.getByText('National Robotics Hackathon')).toBeInTheDocument();
  });
});
