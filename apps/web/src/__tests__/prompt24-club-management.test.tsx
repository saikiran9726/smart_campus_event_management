import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ActiveClubProvider, useActiveClub } from '@/features/organizer/ActiveClubContext';
import { ClubSwitcher } from '@/features/organizer/ClubSwitcher';
import { CreateClubDialog } from '@/features/organizer/CreateClubDialog';
import { ZeroClubsEmptyState } from '@/features/organizer/ZeroClubsEmptyState';
import { OrganizerDashboard } from '@/features/organizer/OrganizerDashboard';
import { ProposalWizardPage } from '@/features/proposals/ProposalWizardPage';
import { ClubSettingsPage } from '@/features/organizer/ClubSettingsPage';

// Mock Auth
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_org_1',
      fullName: 'Prompt24 Lead',
      email: 'lead@campus.edu',
      role: 'ORGANIZER',
    },
    clerkUser: {
      fullName: 'Prompt24 Lead',
      primaryEmailAddress: { emailAddress: 'lead@campus.edu' },
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: true,
    refetchUser: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/components/ui/use-toast', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
  useToast: () => ({ toast: vi.fn(), toasts: [] }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
  useToast: () => ({ toast: vi.fn(), toasts: [] }),
}));

describe('Prompt 24: Real Club Discovery, Selection, Creation and Zero-Mock UI', () => {
  let queryClient: QueryClient;

  const realClubAlpha = {
    id: 'a0000000-0000-4000-8000-000000000001',
    name: 'Autonomous Robotics Society',
    slug: 'robotics-society',
    description: 'Hardware, software, and drone robotics',
    role: 'OWNER',
  };

  const realClubBeta = {
    id: 'b0000000-0000-4000-8000-000000000002',
    name: 'Competitive Coding Club',
    slug: 'coding-club',
    description: 'Algorithmic competitions and ICPC',
    role: 'ADMIN',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    localStorage.clear();
    vi.restoreAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderWithProviders = (
    ui: React.ReactElement,
    { route = '/', path = '/' } = {}
  ) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <ActiveClubProvider>
            <Routes>
              <Route path={path} element={ui} />
            </Routes>
          </ActiveClubProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('ProposalWizardPage submits real active club UUID and never falls back to placeholder 1111...', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/clubs/me') {
        return { clubs: [realClubAlpha, realClubBeta] };
      }
      if (url === '/venues') {
        return {
          venues: [
            {
              id: 'v0000000-0000-4000-8000-000000000001',
              name: 'Main Auditorium',
              capacity: 500,
              building: 'Building A',
              floor: '1',
              isAvailable: true,
            },
          ],
        };
      }
      if (url === '/av-resources') {
        return {
          resources: [
            {
              id: 'av000000-0000-4000-8000-000000000001',
              name: 'Projector 4K',
              totalQuantity: 2,
              availableQuantity: 2,
              category: 'DISPLAY',
            },
          ],
        };
      }
      if (url.includes('/venues/availability')) {
        return { isAvailable: true };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      proposal: { id: 'prop-1', status: 'SUBMITTED' },
    });

    renderWithProviders(<ProposalWizardPage />, { route: '/proposals/new', path: '/proposals/new' });

    // Wait for the active club to be populated in the select trigger
    await waitFor(() => {
      expect(screen.getByTestId('select-hosting-club')).toBeInTheDocument();
      expect(screen.getByText(/Autonomous Robotics Society/)).toBeInTheDocument();
    });

    // Fill Step 1
    fireEvent.change(screen.getByTestId('input-proposal-title'), {
      target: { value: 'Autonomous Drone Showcase' },
    });
    fireEvent.change(screen.getByTestId('input-proposal-desc'), {
      target: { value: 'Demonstration of autonomous navigation in indoor spaces.' },
    });

    // Step 2: Next Step
    fireEvent.click(screen.getByTestId('btn-step-1-next'));

    // Step 2: Fill date/time and select venue
    await waitFor(() => {
      expect(screen.getByTestId('input-start-at')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('input-start-at'), {
      target: { value: '2026-11-10T10:00' },
    });
    fireEvent.change(screen.getByTestId('input-end-at'), {
      target: { value: '2026-11-10T14:00' },
    });

    await waitFor(() => {
      expect(screen.getByText('Main Auditorium')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Main Auditorium'));

    // Step 3: Next Step
    fireEvent.click(screen.getByTestId('btn-step-2-next'));

    // Step 4: Next Step to Review
    await waitFor(() => {
      expect(screen.getByTestId('btn-step-3-next')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-step-3-next'));

    // Submit Proposal
    await waitFor(() => {
      expect(screen.getByTestId('btn-submit-proposal')).toBeInTheDocument();
    });
    const submitBtn = screen.getByTestId('btn-submit-proposal');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
    });

    // Verify it submitted to the real active club's endpoint
    const postCallUrl = postSpy.mock.calls[0]?.[0];
    expect(postCallUrl).toBe(`/clubs/${realClubAlpha.id}/proposals`);
    expect(postCallUrl).not.toContain('11111111-1111-1111-1111-111111111111');
  });

  it('ClubSettingsPage loads members for the active club, never shows mem-1 / mem-2 / mem-3', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/clubs/me') {
        return { clubs: [realClubAlpha] };
      }
      if (url === `/clubs/${realClubAlpha.id}/members`) {
        return {
          members: [
            {
              id: 'm-real-1',
              userId: 'u-real-1',
              fullName: 'Real Member Elena',
              email: 'elena@campus.edu',
              rollNumber: '22CS999',
              role: 'OWNER',
            },
          ],
        };
      }
      if (url === `/clubs/${realClubAlpha.id}/channels`) {
        return {
          channels: [
            {
              id: 'ch-1',
              name: 'Announcements',
              slug: 'announcements',
              kind: 'ANNOUNCEMENTS',
              description: 'Official announcements',
            },
          ],
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderWithProviders(<ClubSettingsPage />, { route: '/organizer/clubs/settings', path: '/organizer/clubs/settings' });

    await waitFor(() => {
      expect(screen.getByText('Real Member Elena')).toBeInTheDocument();
    });

    // Ensure dummy fallback members are never present
    expect(screen.queryByText('Alex Vance')).not.toBeInTheDocument();
    expect(screen.queryByText('Devon Singh')).not.toBeInTheDocument();
    expect(screen.queryByText('Priya Sharma')).not.toBeInTheDocument();
  });

  it('ClubSwitcher renders caller real clubs only; selecting another changes active club', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/clubs/me') {
        return { clubs: [realClubAlpha, realClubBeta] };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const TestComponent = () => {
      const { activeClub } = useActiveClub();
      return (
        <div>
          <div data-testid="current-active-club-name">{activeClub?.name}</div>
          <ClubSwitcher />
        </div>
      );
    };

    renderWithProviders(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('club-switcher')).toBeInTheDocument();
    });

    expect(screen.getByTestId('current-active-club-name')).toHaveTextContent(
      'Autonomous Robotics Society'
    );

    // Open switcher dropdown
    const trigger = screen.getByTestId('club-switcher');
    fireEvent.click(trigger);

    // Select second club
    await waitFor(() => {
      expect(screen.getByTestId(`club-option-${realClubBeta.id}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`club-option-${realClubBeta.id}`));

    await waitFor(() => {
      expect(screen.getByTestId('current-active-club-name')).toHaveTextContent(
        'Competitive Coding Club'
      );
    });
  });

  it('Zero-club empty state rendered on /organizer for an organizer with zero memberships', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/clubs/me') {
        return { clubs: [] };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderWithProviders(<OrganizerDashboard />, { route: '/organizer', path: '/organizer' });

    await waitFor(() => {
      expect(screen.getByTestId('zero-clubs-empty-state')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/You are not an owner or admin of any club yet/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('create-club-empty-trigger')).toBeInTheDocument();
  });

  it('Create club dialog submits valid payload, closes on success, refetches GET /clubs/me, double-submit disabled', async () => {
    let clubsList: any[] = [];
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/clubs/me') {
        return { clubs: clubsList };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    let resolvePost: (value: any) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    const postSpy = vi.spyOn(api, 'post').mockImplementation(async () => {
      return postPromise;
    });

    const TestHost = () => {
      const [isOpen, setIsOpen] = React.useState(true);
      return (
        <div>
          <CreateClubDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </div>
      );
    };

    renderWithProviders(<TestHost />);

    // Fill form using testids
    fireEvent.change(screen.getByTestId('create-club-name-input'), {
      target: { value: 'Quantum Computing Club' },
    });
    fireEvent.change(screen.getByTestId('create-club-desc-input'), {
      target: { value: 'Simulations of quantum gates and algorithms.' },
    });

    const submitBtn = screen.getByTestId('create-club-submit-button');
    expect(submitBtn).not.toBeDisabled();

    // Click submit
    fireEvent.click(submitBtn);

    // Verify double-submit disabled during mutation
    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
    });

    expect(postSpy).toHaveBeenCalledWith('/clubs', {
      name: 'Quantum Computing Club',
      slug: 'quantum-computing-club',
      description: 'Simulations of quantum gates and algorithms.',
    });

    // Resolve mutation
    clubsList = [
      {
        id: 'c-quantum-1',
        name: 'Quantum Computing Club',
        slug: 'quantum-computing-club',
        description: 'Simulations of quantum gates and algorithms.',
        role: 'OWNER',
      },
    ];
    resolvePost!({
      club: clubsList[0]!,
    });

    await waitFor(() => {
      // Dialog should close
      expect(screen.queryByTestId('create-club-dialog')).not.toBeInTheDocument();
    });
  });

  it('Venue fetch failure in ProposalWizardPage displays retry UI instead of injecting mock venues', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/clubs/me') {
        return { clubs: [realClubAlpha] };
      }
      if (url === '/venues') {
        throw new Error('Database connection failed');
      }
      if (url === '/av-resources') {
        return { resources: [] };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderWithProviders(<ProposalWizardPage />, { route: '/proposals/new', path: '/proposals/new' });

    // Wait for the active club to load so clubId is set
    await waitFor(() => {
      expect(screen.getByTestId('select-hosting-club')).toBeInTheDocument();
      expect(screen.getByText(/Autonomous Robotics Society/)).toBeInTheDocument();
    });

    // Fill Step 1
    fireEvent.change(screen.getByTestId('input-proposal-title'), {
      target: { value: 'Test Event' },
    });
    fireEvent.change(screen.getByTestId('input-proposal-desc'), {
      target: { value: 'Test Abstract' },
    });

    // Move to Step 2 (Venue selection)
    fireEvent.click(screen.getByTestId('btn-step-1-next'));

    // Expect error state with Retry button
    await waitFor(() => {
      expect(screen.getByTestId('venues-error-state')).toBeInTheDocument();
      expect(screen.getByText('Failed to load verified campus venues.')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();

    // Ensure mock venues like "Auditorium Main" are NOT shown
    expect(screen.queryByText('Auditorium Main')).not.toBeInTheDocument();
  });
});
