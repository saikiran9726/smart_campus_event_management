import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AnalyticsPage } from '../features/organizer/AnalyticsPage';
import { ErrorBoundary } from '../components/primitives/error-boundary';
import { api } from '../lib/api';

vi.mock('recharts', async () => {
  const original = await vi.importActual<any>('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div className="recharts-mock">{children}</div>,
  };
});

vi.mock('../features/organizer/ActiveClubContext', () => ({
  useActiveClub: () => ({
    activeClubId: 'club_naac_123',
    clubs: [{ id: 'club_naac_123', name: 'IEEE Student Branch' }],
    isLoading: false,
    setActiveClubId: vi.fn(),
  }),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_org',
      fullName: 'Lead Organizer',
      email: 'lead@campus.edu',
      role: 'ORGANIZER',
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: true,
    hasRole: () => true,
    signOut: vi.fn(),
  }),
}));

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('Area 4: NAAC Analytics Bug Fix & Club-Wide Dashboard UI', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createClient();
    vi.clearAllMocks();
  });

  it('renders Event Analytics post-mortem safely without crashing on revenueSandbox', async () => {
    const mockEventAnalytics = {
      eventId: 'ev_123',
      eventTitle: 'Cloud & AI Bootcamp',
      eventSlug: 'cloud-ai-bootcamp',
      funnel: {
        registered: 100,
        checkedIn: 85,
        noShowCount: 15,
        conversionRate: 85,
      },
      arrivalCurve: {
        buckets: [{ bucket: '09:00', count: 40 }],
        peakBucket: { bucket: '09:00', count: 40 },
      },
      scanStats: {
        green: 85,
        red: 2,
        yellow: 1,
        duplicateAttempts: 0,
      },
      reviews: {
        average: 4.8,
        count: 24,
        histogram: { 5: 20, 4: 4, 3: 0, 2: 0, 1: 0 },
      },
      revenueSandbox: {
        grossPaise: 25000,
        refundsPaise: 0,
        netPaise: 25000,
        isSandbox: true,
      },
    };

    vi.spyOn(api, 'get').mockResolvedValue(mockEventAnalytics as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizer/events/ev_123/analytics']}>
          <Routes>
            <Route
              path="/organizer/events/:eventId/analytics"
              element={<AnalyticsPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify title and event name
    expect(
      await screen.findByRole('heading', { name: /Post-Mortem:.*Cloud & AI Bootcamp/i })
    ).toBeInTheDocument();

    // Verify funnel metrics
    expect(screen.getByText('Conversion')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Arrivals')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();

    // Verify revenueSandbox displays without crash
    expect(screen.getByTestId('metric-net-revenue')).toHaveTextContent('₹250');

    // Verify reviews rating
    expect(screen.getByText(/4\.8 ★/)).toBeInTheDocument();
    expect(screen.getByText(/24 verified reviews/i)).toBeInTheDocument();
  });

  it('renders Club-Wide NAAC Dashboard with KPI metrics, privacy suppression, and ledger', async () => {
    const mockClubNaac = {
      club: {
        id: 'club_naac_123',
        name: 'IEEE Student Branch',
        slug: 'ieee-branch',
      },
      academicYear: 'ALL',
      eventsCount: 4,
      totalRegistered: 320,
      totalAttended: 280,
      overallAttendanceRate: 87.5,
      ratings: {
        averageEventRating: 4.7,
        averageClubRating: 4.6,
        reviewCount: 52,
      },
      demographics: {
        buckets: [
          { department: 'Computer Science', count: 180, displayLabel: '180' },
          { department: 'Other Cohorts', count: null, displayLabel: '< 3 (2 total)' },
        ],
        suppressedCount: 2,
      },
      events: [
        {
          id: 'ev_1',
          title: 'Autonomous Robotics Hackathon',
          slug: 'robotics-hack',
          category: 'Technical',
          date: '2025-02-14T09:00:00.000Z',
          registered: 120,
          attended: 110,
          attendanceRate: 91.7,
          eventRating: 4.9,
          clubRating: 4.8,
        },
      ],
    };

    vi.spyOn(api, 'get').mockResolvedValue(mockClubNaac as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizer/analytics']}>
          <Routes>
            <Route path="/organizer/analytics" element={<AnalyticsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify Club-Wide Header
    expect(
      await screen.findByRole('heading', { name: /Club NAAC Accreditation & Analytics/i })
    ).toBeInTheDocument();
    expect(screen.getByText('IEEE Student Branch')).toBeInTheDocument();

    // Wait for KPI Cards to load from async query
    expect(await screen.findByTestId('metric-events-count')).toHaveTextContent('4');
    expect(screen.getByText('Events Organised')).toBeInTheDocument();
    expect(screen.getByText('Total Registered')).toBeInTheDocument();
    expect(screen.getByTestId('metric-total-registered')).toHaveTextContent('320');
    expect(screen.getAllByText('Attendance Rate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('metric-attendance-rate')).toHaveTextContent('87.5%');

    // Verify Demographics Privacy Suppression (< 3)
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('180')).toBeInTheDocument();
    expect(screen.getByText('Other Cohorts')).toBeInTheDocument();
    expect(screen.getByText('< 3 (2 total)')).toBeInTheDocument();

    // Verify Ledger Table Row
    expect(screen.getByText('Autonomous Robotics Hackathon')).toBeInTheDocument();
    expect(screen.getByText('91.7%')).toBeInTheDocument();
  });

  it('downloads NAAC accreditation dossier via authenticated api.getBlob', async () => {
    const mockClubNaac = {
      club: { id: 'club_naac_123', name: 'IEEE', slug: 'ieee' },
      academicYear: 'ALL',
      eventsCount: 1,
      totalRegistered: 10,
      totalAttended: 9,
      overallAttendanceRate: 90,
      ratings: { averageEventRating: 5, averageClubRating: 5, reviewCount: 5 },
      demographics: { buckets: [], suppressedCount: 0 },
      events: [],
    };

    vi.spyOn(api, 'get').mockResolvedValue(mockClubNaac as any);

    const mockBlob = new Blob(['pdf mock content'], { type: 'application/pdf' });
    const getBlobSpy = vi.spyOn(api, 'getBlob').mockResolvedValue(mockBlob);

    // Mock URL.createObjectURL and revokeObjectURL
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizer/analytics']}>
          <Routes>
            <Route path="/organizer/analytics" element={<AnalyticsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(
      await screen.findByRole('heading', { name: /Club NAAC Accreditation & Analytics/i })
    ).toBeInTheDocument();

    const exportBtn = await screen.findByTestId('btn-naac-export');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(getBlobSpy).toHaveBeenCalledWith(
        expect.stringContaining('/clubs/club_naac_123/reports/naac?format=pdf')
      );
    });
  });

  it('catches runtime errors in ErrorBoundary fallback', () => {
    const ThrowingComponent = () => {
      throw new Error('Simulated analytics rendering failure');
    };

    // Suppress console.error output for intentional error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Simulated analytics rendering failure')).toBeInTheDocument();

    spy.mockRestore();
  });
});
