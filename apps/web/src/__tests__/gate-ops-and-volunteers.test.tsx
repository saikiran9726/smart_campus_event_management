import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GateOps } from '@/features/organizer/GateOps';
import { VolunteerDashboardPage } from '@/features/volunteer/VolunteerDashboardPage';
import { api } from '@/lib/api';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_lead_1',
      fullName: 'Lead Operator',
      email: 'lead@campus.edu',
      role: 'ORGANIZER',
    },
    isAdmin: true,
    isFaculty: false,
    isClubOrganizer: true,
    hasRole: () => true,
    signOut: vi.fn(),
  }),
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

describe('Gate Operations & Volunteer Management UI Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('1. Gate Operations Attendee Directory & Real Stats', () => {
    it('renders live authoritative telemetry counters without mock numbers on error', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/gate/stats')) {
          return {
            checkedIn: 18,
            totalCapacity: 150,
            remainingCapacity: 132,
            mealsDispensed: 12,
            kitsDispensed: 15,
            totalRegistrations: 140,
            confirmedRegistrations: 120,
            pendingPayments: 10,
            waitlistedCount: 10,
            cancelledCount: 0,
          };
        }
        if (url.includes('/passkeys')) {
          return { passkeys: [] };
        }
        if (url.includes('/form/responses')) {
          return {
            items: [
              {
                registrationId: 'reg-001',
                studentName: 'Maya Lin',
                rollNumber: '21CS042',
                email: 'maya@campus.edu',
                ticketStatus: 'CHECKED_IN',
                status: 'CONFIRMED',
                paymentStatus: 'SUCCEEDED',
                registeredAt: '2026-11-01T10:00:00Z',
                user: {
                  id: 'u-1',
                  fullName: 'Maya Lin',
                  email: 'maya@campus.edu',
                  rollNumber: '21CS042',
                  department: 'Computer Science',
                  year: 3,
                  phone: '+15550199',
                },
                ticket: {
                  id: 't-1',
                  token: 'TOKEN123',
                  status: 'CHECKED_IN',
                  checkedInAt: '2026-11-01T11:30:00Z',
                  checkedInVia: 'SCANNER',
                },
                team: {
                  id: 'tm-1',
                  name: 'Binary Beasts',
                },
                answers: {
                  q1: {
                    labelSnapshot: 'T-Shirt Size',
                    typeSnapshot: 'SINGLE_SELECT',
                    value: 'Medium',
                  },
                },
              },
            ],
            total: 1,
          };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/organizer/events/evt-101/gate']}>
            <Routes>
              <Route path="/organizer/events/:eventId/gate" element={<GateOps />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify authoritative stats rendered
      await waitFor(() => {
        expect(screen.getByTestId('counter-checked-in')).toHaveTextContent('18');
        expect(screen.getByTestId('counter-remaining')).toHaveTextContent('132');
        expect(screen.getByTestId('counter-meals')).toHaveTextContent('12');
        expect(screen.getByTestId('counter-kits')).toHaveTextContent('15');
      });

      // Verify real attendee record rendered in ledger
      await waitFor(() => {
        expect(screen.getByText('Maya Lin')).toBeInTheDocument();
        expect(screen.getByText(/21CS042 · maya@campus.edu/)).toBeInTheDocument();
        expect(screen.getByText(/Binary Beasts/)).toBeInTheDocument();
      });

      // Click on attendee row to open details modal
      fireEvent.click(screen.getByText('Maya Lin'));

      await waitFor(() => {
        expect(screen.getByText('Attendee Details')).toBeInTheDocument();
        expect(screen.getByText('T-Shirt Size')).toBeInTheDocument();
        expect(screen.getByText('Medium')).toBeInTheDocument();
        expect(screen.getAllByText(/Binary Beasts/).length).toBeGreaterThan(0);
        expect(screen.getByText(/Checked in at/)).toBeInTheDocument();
      });
    });

    it('download filtered CSV button links to filtered CSV endpoint', async () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/gate/stats')) {
          return { checkedIn: 0, totalCapacity: 100, remainingCapacity: 100, mealsDispensed: 0, kitsDispensed: 0 };
        }
        if (url.includes('/passkeys')) return { passkeys: [] };
        if (url.includes('/form/responses')) return { items: [], total: 0 };
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/organizer/events/evt-101/gate']}>
            <Routes>
              <Route path="/organizer/events/:eventId/gate" element={<GateOps />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-download-responses-csv')).toBeInTheDocument();
      });

      // Type a search query to verify query parameter propagation
      const searchInput = screen.getByTestId('input-attendee-search');
      fireEvent.change(searchInput, { target: { value: 'Maya' } });

      const downloadBtn = screen.getByTestId('btn-download-responses-csv');
      fireEvent.click(downloadBtn);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        expect.stringContaining('/events/evt-101/form/responses.csv?q=Maya'),
        '_blank'
      );
    });
  });

  describe('2. Volunteer Duty Portal', () => {
    it('renders assigned volunteer duties and triggers ticket scanner launch', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        assignments: [
          {
            id: 'asgn-1',
            eventId: 'evt-202',
            eventTitle: 'University Tech Expo 2026',
            eventSlug: 'tech-expo-2026',
            eventStatus: 'LIVE',
            startDate: '2026-11-05T09:00:00Z',
            endDate: '2026-11-05T18:00:00Z',
            capacity: 500,
            remainingCapacity: 240,
            venueName: 'Auditorium Hall A',
            gate: 'Main North Gate',
            role: 'SCANNER',
            notes: 'Validate student QR passes and check food coupons.',
            status: 'ACTIVE',
            checkedInCount: 260,
            myScanCount: 45,
          },
        ],
      });

      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        token: 'VOL_JWT_TOKEN_ABC123',
        eventId: 'evt-202',
        eventTitle: 'University Tech Expo 2026',
        volunteerName: 'Sam Volunteer',
        gate: 'Main North Gate',
        role: 'SCANNER',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/volunteer']}>
            <VolunteerDashboardPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('University Tech Expo 2026')).toBeInTheDocument();
        expect(screen.getByText('Main North Gate')).toBeInTheDocument();
        expect(screen.getByText('Auditorium Hall A')).toBeInTheDocument();
        expect(screen.getByText('45')).toBeInTheDocument();
      });

      // Click Launch Ticket Scanner
      const launchBtn = screen.getByTestId('btn-launch-scanner-evt-202');
      fireEvent.click(launchBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/me/volunteer-assignments/asgn-1/scanner-session', {});
        expect(sessionStorage.getItem('eventora_scanner_token')).toBe('VOL_JWT_TOKEN_ABC123');
      });
    });

    it('activates volunteer invitation code from dashboard', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        assignments: [],
      });

      const activateSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        success: true,
        event: { title: 'Robotics Workshop' },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/volunteer']}>
            <VolunteerDashboardPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('input-volunteer-code')).toBeInTheDocument();
      });

      const codeInput = screen.getByTestId('input-volunteer-code');
      fireEvent.change(codeInput, { target: { value: 'VOL-9F4D28A1' } });

      const activateBtn = screen.getByTestId('btn-activate-volunteer');
      fireEvent.click(activateBtn);

      await waitFor(() => {
        expect(activateSpy).toHaveBeenCalledWith('/volunteers/activate', {
          token: 'VOL-9F4D28A1',
        });
      });
    });
  });
});
