import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventPage } from '@/features/event/EventPage';
import { PassportPage } from '@/features/passport/PassportPage';
import { api } from '@/lib/api';

const mockStudentUser = {
  id: 'usr_student_test',
  fullName: 'Test Student',
  email: 'student@campus.edu',
  role: 'STUDENT' as const,
  rollNumber: '22CS01042',
  collegeName: 'Test Tech University',
  department: 'Computer Science',
  year: 3,
  program: 'B.Tech CS',
  phone: '9876543210',
};

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: mockStudentUser,
    clerkUser: {
      fullName: 'Test Student',
      imageUrl: 'https://example.com/avatar.png',
      primaryEmailAddress: { emailAddress: 'student@campus.edu' },
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: false,
    hasRole: () => true,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/lib/socket', () => ({
  useSeats: () => ({ remaining: null, capacity: null }),
  useSocketEvent: vi.fn(),
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe('Event Registration State & Duplicate Prevention', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const baseEvent = {
    id: 'evt-test-123',
    slug: 'hackathon-ai-2026',
    title: 'Autonomous AI Hackathon 2026',
    narrativeMarkdown: 'Hackathon details and instructions.',
    category: 'Hackathon',
    status: 'PUBLISHED',
    startAt: new Date(Date.now() + 86400000).toISOString(),
    endAt: new Date(Date.now() + 172800000).toISOString(),
    venue: 'Campus Tech Hall A',
    pricePaise: 0,
    capacity: 100,
    seatsRemaining: 25,
    remainingCapacity: 25,
    userRegistration: null,
  };

  it('1. Unregistered user with open seats sees Register Now and opens registration dialog', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/events/hackathon-ai-2026') {
        return { event: { ...baseEvent, userRegistration: null } };
      }
      if (url.includes('/form')) {
        return { questions: [] };
      }
      return {};
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/hackathon-ai-2026']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Register Now');
    });

    fireEvent.click(screen.getByTestId('event-cta-button'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('2. Unregistered user with sold-out seats sees Join Queue', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      event: {
        ...baseEvent,
        seatsRemaining: 0,
        remainingCapacity: 0,
        userRegistration: null,
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/hackathon-ai-2026']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Join Queue');
      expect(screen.getByTestId('mobile-event-cta')).toHaveTextContent('Join Queue');
    });
  });

  it('3. Confirmed registration displays Already Registered • View Ticket, opening ticket modal with QR instead of registration dialog', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/events/hackathon-ai-2026') {
        return {
          event: {
            ...baseEvent,
            seatsRemaining: 0, // Even when sold out!
            remainingCapacity: 0,
            userRegistration: {
              id: 'reg-active-1',
              status: 'CONFIRMED',
              paymentStatus: 'NOT_REQUIRED',
              ticket: {
                id: 'tkt-1',
                status: 'VALID',
              },
            },
          },
        };
      }
      return {};
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/hackathon-ai-2026']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Registration state takes precedence over sold-out state!
    await waitFor(() => {
      expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Already Registered • View Ticket');
    });

    fireEvent.click(screen.getByTestId('event-cta-button'));

    // Opens ticket modal, NOT register dialog
    await waitFor(() => {
      expect(screen.getByTestId('event-ticket-modal')).toBeInTheDocument();
      expect(screen.getByTestId('active-ticket-qr-container')).toBeInTheDocument();
      expect(screen.getByTestId('ticket-modal-venue')).toHaveTextContent('Campus Tech Hall A');
    });
  });

  it('4. Confirmed registration with PENDING payment displays Complete Payment (Pending), opening checkout modal', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      event: {
        ...baseEvent,
        pricePaise: 49900,
        userRegistration: {
          id: 'reg-pending-pay',
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          amountPaise: 49900,
          ticket: null,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/hackathon-ai-2026']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Complete Payment (Pending)');
    });

    fireEvent.click(screen.getByTestId('event-cta-button'));

    await waitFor(() => {
      expect(screen.getByTestId('pending-payment-modal')).toBeInTheDocument();
      expect(screen.getByTestId('sandbox-checkout')).toBeInTheDocument();
    });
  });

  it('5. Waitlisted registration displays queue position and opens waitlist status modal', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      event: {
        ...baseEvent,
        seatsRemaining: 0,
        remainingCapacity: 0,
        userRegistration: {
          id: 'reg-waitlisted-5',
          status: 'WAITLISTED',
          waitlistPosition: 5,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/hackathon-ai-2026']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Waitlisted (Queue #5)');
    });

    fireEvent.click(screen.getByTestId('event-cta-button'));

    await waitFor(() => {
      expect(screen.getByTestId('waitlist-status-modal')).toBeInTheDocument();
      expect(screen.getByText('#5')).toBeInTheDocument();
    });
  });

  it('6. Revoked ticket displays Pass Inactive or Revoked and suppresses QR display', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      event: {
        ...baseEvent,
        userRegistration: {
          id: 'reg-revoked-1',
          status: 'CONFIRMED',
          ticket: {
            id: 'tkt-revoked-1',
            status: 'REVOKED',
          },
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/hackathon-ai-2026']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Pass Inactive or Revoked');
    });

    fireEvent.click(screen.getByTestId('event-cta-button'));

    await waitFor(() => {
      expect(screen.getByTestId('event-ticket-modal')).toBeInTheDocument();
      expect(screen.getByTestId('revoked-ticket-banner')).toBeInTheDocument();
      expect(screen.queryByTestId('active-ticket-qr-container')).not.toBeInTheDocument();
    });
  });

  it('7. Ineligible marked no-show attendee sees disabled CTA', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      event: {
        ...baseEvent,
        userRegistration: {
          id: 'reg-noshow',
          status: 'NO_SHOW',
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/hackathon-ai-2026']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      const cta = screen.getByTestId('event-cta-button');
      expect(cta).toHaveTextContent('Ineligible (Marked No-Show)');
      expect(cta).toBeDisabled();
    });
  });

  it('8. PassportPage excludes PENDING payment registrations from upcoming tickets', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/me/registrations') {
        return {
          items: [
            {
              registration: {
                id: 'reg-paid-pending',
                userId: 'usr_student_test',
                eventId: 'evt-paid-1',
                status: 'CONFIRMED',
                paymentStatus: 'PENDING',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              event: {
                id: 'evt-paid-1',
                title: 'Paid Design Workshop',
                slug: 'paid-design-workshop',
                startAt: new Date(Date.now() + 86400000).toISOString(),
                endAt: new Date(Date.now() + 172800000).toISOString(),
                category: 'Workshop',
                isPaid: true,
                pricePaise: 49900,
              },
              ticket: null,
            },
            {
              registration: {
                id: 'reg-free-confirmed',
                userId: 'usr_student_test',
                eventId: 'evt-free-1',
                status: 'CONFIRMED',
                paymentStatus: 'NOT_REQUIRED',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              event: {
                id: 'evt-free-1',
                title: 'Free Campus Seminar',
                slug: 'free-campus-seminar',
                startAt: new Date(Date.now() + 86400000).toISOString(),
                endAt: new Date(Date.now() + 172800000).toISOString(),
                category: 'Seminar',
                isPaid: false,
                pricePaise: 0,
              },
              ticket: {
                id: 'tkt-free-1',
                registrationId: 'reg-free-confirmed',
                userId: 'usr_student_test',
                token: 'EVT-TEST-PASS-1234',
                status: 'VALID',
                createdAt: new Date().toISOString(),
              },
            },
          ],
        };
      }
      if (url === '/me/passport') {
        return { passport: [] };
      }
      return {};
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/passport']}>
          <PassportPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Free confirmed event is displayed
    await waitFor(() => {
      expect(screen.getByText('Free Campus Seminar')).toBeInTheDocument();
      expect(screen.getByText('Upcoming (1)')).toBeInTheDocument();
    });

    // Pending payment event is NOT counted in upcoming passes
    expect(screen.queryByText('Paid Design Workshop')).not.toBeInTheDocument();
  });

  it('9. Ticket modal renders venueName accurately when returned from backend response without hardcoding', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      event: {
        ...baseEvent,
        venue: undefined,
        venueName: 'Campus Main Venue',
        userRegistration: {
          id: 'reg-active-venue',
          status: 'CONFIRMED',
          ticket: {
            id: 'tkt-venue',
            status: 'VALID',
          },
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/events/hackathon-ai-2026']}>
          <Routes>
            <Route path="/events/:slug" element={<EventPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Already Registered • View Ticket');
    });

    fireEvent.click(screen.getByTestId('event-cta-button'));

    await waitFor(() => {
      expect(screen.getByTestId('event-ticket-modal')).toBeInTheDocument();
      expect(screen.getByTestId('ticket-modal-venue')).toHaveTextContent('Campus Main Venue');
      expect(screen.getByTestId('ticket-modal-venue')).not.toBeEmptyDOMElement();
    });
  });
});
