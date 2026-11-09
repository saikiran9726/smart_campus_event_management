import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoveryPage } from '../features/discovery/DiscoveryPage';
import { EventCard, EventCardData } from '../features/discovery/EventCard';
import { EventPage } from '../features/event/EventPage';
import { api } from '../lib/api';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_student_test',
      fullName: 'Sam Student',
      email: 'sam@campus.edu',
      role: 'ATTENDEE',
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: false,
    hasRole: () => true,
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/socket', () => ({
  useSeats: () => ({ remaining: 0, capacity: 100 }),
  useSocketEvent: vi.fn(),
  getSocket: () => ({ connected: false }),
}));

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('Area 1: Discovery Page Past Events & Completed Badges', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createClient();
    vi.clearAllMocks();
  });

  it('renders timeframe segmented control tabs and switches between Upcoming, Past, and All', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      requestedUrls.push(url);
      return { items: [], nextCursor: null };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DiscoveryPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const segmentedControl = screen.getByTestId('timeframe-segmented-control');
    const upcomingTab = within(segmentedControl).getByRole('button', { name: /^upcoming$/i });
    const pastTab = within(segmentedControl).getByRole('button', { name: /^past$/i });
    const allTab = within(segmentedControl).getByRole('button', { name: /^all$/i });

    expect(upcomingTab).toBeInTheDocument();
    expect(pastTab).toBeInTheDocument();
    expect(allTab).toBeInTheDocument();

    // Default requests timeframe=upcoming
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('timeframe=upcoming'))).toBe(true);
    });

    // Click Past tab
    fireEvent.click(pastTab);

    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('timeframe=past'))).toBe(true);
      expect(screen.getByText('Past Events')).toBeInTheDocument();
    });

    // Click All tab
    fireEvent.click(allTab);

    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('timeframe=all'))).toBe(true);
      expect(screen.getByText('All Campus Events')).toBeInTheDocument();
    });
  });

  it('renders completed badge, rating preview, and view reviews CTA on past event cards', () => {
    const pastEvent: EventCardData = {
      id: 'evt_past_1',
      slug: 'hackathon-2025',
      title: 'Annual Campus Hackathon 2025',
      description: 'The premier collegiate hackathon.',
      category: 'Hackathon',
      startAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      endAt: new Date(Date.now() - 86400000 * 8).toISOString(),
      capacity: 200,
      seatsRemaining: 0,
      isPast: true,
      averageRating: 4.8,
      reviewCount: 42,
    };

    render(
      <MemoryRouter>
        <EventCard event={pastEvent} />
      </MemoryRouter>
    );

    // Completed badge is visible
    expect(screen.getByTestId('completed-badge')).toHaveTextContent('Completed');
    // Compact star rating is visible
    expect(screen.getByText('★ 4.8')).toBeInTheDocument();
    expect(screen.getByText('(42)')).toBeInTheDocument();
    // CTA to view event and reviews is visible
    expect(screen.getByText(/View event and reviews/i)).toBeInTheDocument();
    // Free or price badge should NOT be rendered
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
  });

  it('renders "No reviews yet" for past event without reviews', () => {
    const pastEventNoReviews: EventCardData = {
      id: 'evt_past_2',
      slug: 'workshop-2025',
      title: 'Robotics Workshop',
      category: 'Workshop',
      startAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      endAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      capacity: 50,
      seatsRemaining: 0,
      isPast: true,
      averageRating: null,
      reviewCount: 0,
    };

    render(
      <MemoryRouter>
        <EventCard event={pastEventNoReviews} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('completed-badge')).toHaveTextContent('Completed');
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
  });

  it('renders "Event Completed" disabled button on EventPage when event has concluded', async () => {
    const mockDetail = {
      id: 'evt_completed_99',
      slug: 'ai-symposium',
      title: 'AI Symposium 2025',
      narrativeMarkdown: '## Concluded symposium overview',
      category: 'Tech',
      status: 'COMPLETED',
      startAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      endAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      pricePaise: 0,
      capacity: 100,
      seatsRemaining: 0,
      isPast: true,
      averageRating: 4.9,
      reviewCount: 15,
      club: { id: 'club_1', name: 'AI Society' },
      userRegistration: null,
    };

    vi.spyOn(api, 'get').mockImplementation(async () => {
      return { event: mockDetail };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/ai-symposium']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Event Completed')[0]).toBeInTheDocument();
    });

    const completedButtons = screen.getAllByRole('button', { name: /event completed/i });
    expect(completedButtons[0]).toBeDisabled();
  });
});
