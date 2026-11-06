import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '@/routes/admin';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: { id: 'admin_1', fullName: 'Sai Kiran Roopreddy', email: 'saikiranroopreddy@gmail.com', role: 'ADMIN' },
    isAdmin: true,
  }),
}));

function renderAdminPage(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Admin Dashboard Metrics Mapping & Bot Filtering Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders genuine zero counts for clubs and check-ins (no hardcoded 18 or 1420)', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/admin/analytics/campus') {
        return {
          overview: {
            totalClubs: 0,
            totalEvents: 0,
            totalRegistrations: 0,
            totalCheckedIn: 0,
            campusAttendanceRate: 0,
          },
          clubs: [],
          topEvents: [],
        };
      }
      return {};
    });

    renderAdminPage();

    // Verify Registered Clubs displays 0
    await waitFor(() => {
      expect(screen.getByText('Registered Clubs')).toBeInTheDocument();
    });

    const clubCard = screen.getByText('Registered Clubs').closest('.border-border');
    expect(clubCard).not.toBeNull();
    expect(clubCard).toHaveTextContent('0');
    expect(clubCard).not.toHaveTextContent('18');

    // Verify Campus Check-ins displays 0
    const checkinCard = screen.getByText('Campus Check-ins').closest('.border-border');
    expect(checkinCard).not.toBeNull();
    expect(checkinCard).toHaveTextContent('0');
    expect(checkinCard).not.toHaveTextContent('1420');
  });

  it('2. Correctly renders positive database counts from overview response shape', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/admin/analytics/campus') {
        return {
          overview: {
            totalClubs: 7,
            totalEvents: 12,
            totalRegistrations: 250,
            totalCheckedIn: 180,
            campusAttendanceRate: 72,
          },
          clubs: [],
          topEvents: [],
        };
      }
      return {};
    });

    renderAdminPage();

    await waitFor(() => {
      const clubCard = screen.getByText('Registered Clubs').closest('.border-border');
      expect(clubCard).toHaveTextContent('7');
    });

    const checkinCard = screen.getByText('Campus Check-ins').closest('.border-border');
    expect(checkinCard).toHaveTextContent('180');
  });

  it('3. Renders human users and excludes internal system bot from Users & Roles directory', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/admin/analytics/campus') {
        return {
          overview: {
            totalClubs: 0,
            totalEvents: 0,
            totalRegistrations: 0,
            totalCheckedIn: 0,
            campusAttendanceRate: 0,
          },
          clubs: [],
          topEvents: [],
        };
      }
      if (url.startsWith('/admin/users')) {
        return {
          users: [
            {
              id: '04576c14-e36d-4623-883f-0a017cf337bb',
              email: 'saikiranroopreddy@gmail.com',
              fullName: 'Sai Kiran Roopreddy',
              role: 'ADMIN',
              rollNumber: null,
              department: null,
              year: null,
              phone: null,
              strikeCount: 0,
              consecutiveNoShows: 0,
              cooldownUntil: null,
              createdAt: new Date().toISOString(),
            },
            {
              id: '00000000-0000-0000-0000-000000000000',
              email: 'system@eventora.internal',
              fullName: 'Eventora System',
              role: 'ADMIN',
              rollNumber: null,
              department: null,
              year: null,
              phone: null,
              strikeCount: 0,
              consecutiveNoShows: 0,
              cooldownUntil: null,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          page: 1,
          limit: 15,
          totalPages: 1,
        };
      }
      return {};
    });

    renderAdminPage('/admin?tab=users');

    await waitFor(() => {
      expect(screen.getByText('Sai Kiran Roopreddy')).toBeInTheDocument();
    });

    expect(screen.queryByText('Eventora System')).not.toBeInTheDocument();
    expect(screen.queryByText('system@eventora.internal')).not.toBeInTheDocument();
  });
});
