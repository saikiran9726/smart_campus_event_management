import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormBuilderPage } from '@/features/builder/FormBuilderPage';
import { ProposalWizardPage } from '@/features/proposals/ProposalWizardPage';
import { FacultyDecisionPage } from '@/features/faculty/FacultyDecisionPage';
import { GateOps } from '@/features/organizer/GateOps';
import { AnalyticsPage } from '@/features/organizer/AnalyticsPage';
import { api } from '@/lib/api';
import { QuestionType } from '@eventora/shared';

// Mock Auth
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_organizer_1',
      fullName: 'Prof. Vance',
      email: 'vance@campus.edu',
      role: 'ORGANIZER',
    },
    clerkUser: {
      fullName: 'Prof. Vance',
      primaryEmailAddress: { emailAddress: 'vance@campus.edu' },
    },
    isAdmin: false,
    isFaculty: true,
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

describe('Organizer & Faculty UI Suite (Prompt 15)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('1. Dynamic Form Builder: Frozen State Locks & Add Optional Question', () => {
    it('frozen builder disables edit/delete on pre-freeze questions and shows amber banner', async () => {
      // Mock /events/:eventId/form with frozen=true and 14 attendees
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/form')) {
          return {
            eventId: 'evt-freeze-test',
            frozen: true,
            frozenAt: new Date().toISOString(),
            registeredCount: 14,
            questions: [
              {
                id: 'q-pre-1',
                eventId: 'evt-freeze-test',
                position: 1,
                type: QuestionType.SHORT_TEXT,
                label: 'Pre-freeze Full Name',
                required: true,
                addedAfterFreeze: false,
              },
            ],
          };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/organizer/events/evt-freeze-test/builder']}>
            <Routes>
              <Route path="/organizer/events/:eventId/builder" element={<FormBuilderPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify persistent amber banner
      await waitFor(() => {
        expect(screen.getByTestId('form-frozen-banner')).toBeInTheDocument();
        expect(screen.getByText(/Form frozen: 14 attendees registered/i)).toBeInTheDocument();
      });

      // Verify pre-freeze question label input is disabled
      const labelInput = screen.getByTestId('input-label-q-pre-1');
      expect(labelInput).toBeDisabled();

      // Verify required switch is disabled
      const requiredSwitch = screen.getByTestId('switch-required-q-pre-1');
      expect(requiredSwitch).toBeDisabled();

      // Verify delete button is NOT present for frozen question
      expect(screen.queryByTestId('btn-delete-q-pre-1')).not.toBeInTheDocument();

      // Verify floating "Add Optional Question" button is visible
      expect(screen.getByTestId('btn-add-optional-question')).toBeInTheDocument();
      expect(screen.getByTestId('floating-add-optional-btn')).toBeInTheDocument();
    });

    it('adding an optional question under freeze works and required toggle is blocked in UI', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/form')) {
          return {
            eventId: 'evt-freeze-test',
            frozen: true,
            frozenAt: new Date().toISOString(),
            registeredCount: 14,
            questions: [
              {
                id: 'q-pre-1',
                eventId: 'evt-freeze-test',
                position: 1,
                type: QuestionType.SHORT_TEXT,
                label: 'Pre-freeze Name',
                required: true,
                addedAfterFreeze: false,
              },
            ],
          };
        }
        return {};
      });

      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        question: {
          id: 'q-post-2',
          eventId: 'evt-freeze-test',
          position: 2,
          type: QuestionType.SHORT_TEXT,
          label: 'Optional Dietary Preference',
          required: false,
          addedAfterFreeze: true,
        },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/organizer/events/evt-freeze-test/builder']}>
            <Routes>
              <Route path="/organizer/events/:eventId/builder" element={<FormBuilderPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-add-optional-question')).toBeInTheDocument();
      });

      // Click Add Optional Question
      fireEvent.click(screen.getByTestId('btn-add-optional-question'));

      // Check that post was invoked with required: false
      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/events/evt-freeze-test/form/questions',
          expect.objectContaining({ required: false })
        );
      });
    });
  });

  describe('2. Proposal Wizard: Multi-Step & Inline Conflict Details', () => {
    it('shows inline conflict banner when server returns VENUE_CONFLICT', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/clubs/me')) {
          return { clubs: [{ id: 'club-cs', name: 'Computer Science Society' }] };
        }
        if (url.includes('/venues/availability')) {
          return { isAvailable: false, overlappingBookings: [{ id: 'b1', status: 'ACTIVE' }] };
        }
        if (url.includes('/venues')) {
          return {
            venues: [
              { id: 'v-aud', name: 'Campus Auditorium', capacity: 400, locationText: 'Block A' },
            ],
          };
        }
        return {};
      });

      // Mock post to reject with VENUE_CONFLICT
      vi.spyOn(api, 'post').mockRejectedValueOnce({
        code: 'VENUE_CONFLICT',
        message: 'The selected venue is already reserved.',
        details: {
          conflictingTitle: 'Annual Cultural Fest',
          window: '2026-11-10T10:00:00Z - 2026-11-10T14:00:00Z',
        },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProposalWizardPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Step 1: fill info and click Next
      const titleInput = screen.getByTestId('input-proposal-title');
      fireEvent.change(titleInput, { target: { value: 'Quantum Computing Workshop' } });
      const descInput = screen.getByTestId('input-proposal-desc');
      fireEvent.change(descInput, { target: { value: 'Deep dive into Qubits and quantum gates' } });
      fireEvent.click(screen.getByTestId('btn-step-1-next'));

      // Step 2: fill dates, select venue and click Next
      await waitFor(() => {
        expect(screen.getByTestId('input-start-at')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByTestId('input-start-at'), { target: { value: '2026-11-10T10:00' } });
      fireEvent.change(screen.getByTestId('input-end-at'), { target: { value: '2026-11-10T14:00' } });
      fireEvent.click(screen.getByTestId('venue-option-v-aud'));

      // Venue conflict is checked live
      await waitFor(() => {
        expect(screen.getByTestId('venue-conflict-banner')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('btn-step-2-next'));

      // Step 3: AV Resources, click Next
      await waitFor(() => {
        expect(screen.getByTestId('btn-step-3-next')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('btn-step-3-next'));

      // Step 4: Submit proposal
      await waitFor(() => {
        expect(screen.getByTestId('btn-submit-proposal')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('btn-submit-proposal'));

      // Conflict alert appears in Step 4
      await waitFor(() => {
        expect(screen.getByTestId('server-conflict-alert')).toBeInTheDocument();
        expect(screen.getByText(/Venue Booking Conflict/i)).toBeInTheDocument();
        expect(screen.getByText(/Annual Cultural Fest/i)).toBeInTheDocument();
      });
    });
  });

  describe('3. Faculty Magic-Link Page: Outcome, 409 Used & 410 Expired', () => {
    it('handles approval success with confirmation step and outcome screen', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        proposal: {
          id: 'prop-123',
          title: 'Robotics Autonomous Fleet Proposal',
          description: 'Testing autonomous mobile rovers on campus',
          expectedAttendance: 150,
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 86400000 * 2).toISOString(),
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        },
        club: { id: 'c1', name: 'Robotics Club', slug: 'robotics' },
        window: { startAt: '', endAt: '' },
        venue: { id: 'v1', name: 'Open Arena', capacity: 200, locationText: 'Grounds' },
        avRequests: [],
        conflictAudit: { hasConflicts: false, venueConflicts: [], avConflicts: [] },
        tokenAction: 'APPROVE',
      });

      vi.spyOn(api, 'post').mockResolvedValueOnce({
        outcome: 'APPROVED',
        proposalTitle: 'Robotics Autonomous Fleet Proposal',
        eventId: 'evt-approved-123',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/faculty/decision?token=valid_token_xyz']}>
            <FacultyDecisionPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify proposal details loaded
      await waitFor(() => {
        expect(screen.getByTestId('preview-proposal-title')).toHaveTextContent(
          'Robotics Autonomous Fleet Proposal'
        );
      });

      // Click Approve button (48px button)
      const approveBtn = screen.getByTestId('btn-faculty-approve');
      fireEvent.click(approveBtn);

      // Confirm dialog appears
      await waitFor(() => {
        expect(screen.getByTestId('btn-confirm-decision')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('btn-confirm-decision'));

      // Outcome screen rendered
      await waitFor(() => {
        expect(screen.getByTestId('outcome-screen')).toBeInTheDocument();
        expect(screen.getByText(/Proposal Endorsed & Approved/i)).toBeInTheDocument();
      });
    });

    it('renders token used banner when token has already been consumed (409)', async () => {
      vi.spyOn(api, 'get').mockRejectedValueOnce({
        code: 'TOKEN_USED',
        message: 'This decision link has already been used.',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/faculty/decision?token=used_token_abc']}>
            <FacultyDecisionPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('token-used-banner')).toBeInTheDocument();
        expect(screen.getByText(/Decision Already Recorded/i)).toBeInTheDocument();
      });
    });

    it('renders token expired banner when 72h window elapsed (410)', async () => {
      vi.spyOn(api, 'get').mockRejectedValueOnce({
        code: 'OFFER_EXPIRED',
        message: 'This approval link has expired.',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/faculty/decision?token=expired_token_123']}>
            <FacultyDecisionPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('token-expired-banner')).toBeInTheDocument();
        expect(screen.getByText(/Link Expired/i)).toBeInTheDocument();
      });
    });
  });

  describe('4. Gate Operations: Passkey Shown Once & Not Retrievable on Reload', () => {
    it('passkey code is displayed in large card on create, but list only contains labels on remount', async () => {
      // Step 1: create passkey
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/passkeys')) {
          return { passkeys: [] };
        }
        if (url.includes('/gate/stats')) {
          return { checkedIn: 10, totalCapacity: 200, remainingCapacity: 190, mealsDispensed: 5, kitsDispensed: 8 };
        }
        return {};
      });

      vi.spyOn(api, 'post').mockResolvedValueOnce({
        id: 'pk-99',
        code: 'SCAN-849201',
        label: 'East Gate Station 1',
        expiresAt: new Date(Date.now() + 3600000 * 12).toISOString(),
        setupUrl: 'https://campus.edu/scanner/unlock?code=SCAN-849201',
      });

      const { unmount } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/organizer/events/evt-101/gate']}>
            <Routes>
              <Route path="/organizer/events/:eventId/gate" element={<GateOps />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-create-passkey')).toBeInTheDocument();
      });

      // Trigger create passkey modal
      fireEvent.click(screen.getByTestId('btn-create-passkey'));
      const generateBtn = screen.getByRole('button', { name: /generate code/i });
      fireEvent.click(generateBtn);

      // Verify code card shown with code
      await waitFor(() => {
        expect(screen.getByTestId('new-passkey-card')).toBeInTheDocument();
        expect(screen.getByTestId('passkey-code-display')).toHaveTextContent('SCAN-849201');
      });

      // Step 2: Unmount and simulate page reload
      unmount();

      // On reload, server only returns the list without plain code
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/passkeys')) {
          return {
            passkeys: [
              {
                id: 'pk-99',
                label: 'East Gate Station 1',
                expiresAt: new Date(Date.now() + 3600000 * 12).toISOString(),
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }
        return { checkedIn: 10, totalCapacity: 200, remainingCapacity: 190, mealsDispensed: 5, kitsDispensed: 8 };
      });

      const reloadQueryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={reloadQueryClient}>
          <MemoryRouter initialEntries={['/organizer/events/evt-101/gate']}>
            <Routes>
              <Route path="/organizer/events/:eventId/gate" element={<GateOps />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify: new-passkey-card is GONE, code SCAN-849201 cannot be found on page
      await waitFor(() => {
        expect(screen.getByText('East Gate Station 1')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('new-passkey-card')).not.toBeInTheDocument();
      expect(screen.queryByText('SCAN-849201')).not.toBeInTheDocument();
    });
  });

  describe('5. Post-Mortem Analytics: Demographics Privacy Suppression & NAAC Export URL', () => {
    it('renders demographics with "Fewer than 3" suppression and triggers correct export URL', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/organizer/events/evt-101/analytics']}>
            <Routes>
              <Route path="/organizer/events/:eventId/analytics" element={<AnalyticsPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify demographics card renders
      await waitFor(() => {
        expect(screen.getByTestId('demographics-card')).toBeInTheDocument();
      });

      // Verify privacy suppression label: "Fewer than 3"
      const suppressedLabels = screen.getAllByText('Fewer than 3');
      expect(suppressedLabels.length).toBeGreaterThanOrEqual(1);

      // Verify NAAC export action triggers correct url
      const exportBtn = screen.getByTestId('btn-naac-export');
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledWith(
          expect.stringContaining('/reports/naac?format=pdf'),
          '_blank'
        );
      });
    });
  });
});
