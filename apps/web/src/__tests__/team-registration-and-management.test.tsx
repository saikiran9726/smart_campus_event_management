import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamPanel } from '../features/team/TeamPanel';
import { TeamsPanel } from '../features/organizer/TeamsPanel';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/socket', () => ({
  useSocketEvent: vi.fn(),
}));

describe('Team Registration, Management & Invitations UI Suite', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Student TeamPanel: Incoming Invitations, Creation & Inviting', () => {
    it('renders incoming team invitations with Accept and Decline buttons', async () => {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/me/team-invitations') {
          return {
            invitations: [
              {
                id: 'inv-123',
                teamId: 'team-456',
                eventId: 'ev-789',
                status: 'PENDING',
                createdAt: new Date().toISOString(),
                teamName: 'Neural Ninjas',
                teamCode: 'NEU123',
                eventTitle: 'AI Hackathon',
                inviterName: 'Jane Captain',
                inviterEmail: 'jane@univ.edu',
              },
            ],
          };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TeamPanel eventId="ev-789" />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Neural Ninjas/)).toBeInTheDocument();
        expect(screen.getByText(/Jane Captain/)).toBeInTheDocument();
        expect(screen.getByText('Accept')).toBeInTheDocument();
        expect(screen.getByText('Decline')).toBeInTheDocument();
      });

      // Click Accept
      vi.mocked(api.post).mockResolvedValueOnce({
        success: true,
        team: {
          id: 'team-456',
          name: 'Neural Ninjas',
          inviteCode: 'NEU123',
          isLocked: false,
          minSize: 2,
          maxSize: 4,
          members: [
            { id: 'u1', name: 'Jane Captain', role: 'LEADER' },
            { id: 'u2', name: 'Current User', role: 'MEMBER' },
          ],
        },
      });

      fireEvent.click(screen.getByText('Accept'));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/team-invitations/inv-123/accept');
      });
    });

    it('displays active team with roster, allows leader to send invite and cancel pending invitation', async () => {
      const initialTeam = {
        id: 'team-999',
        name: 'Quantum Coders',
        inviteCode: 'QNT999',
        leaderId: 'leader-1',
        isLocked: false,
        minSize: 2,
        maxSize: 4,
        members: [{ id: 'leader-1', name: 'Alice Leader', role: 'LEADER' as const }],
        invitations: [
          {
            id: 'inv-sent-1',
            teamId: 'team-999',
            eventId: 'ev-1',
            status: 'PENDING',
            invitedEmail: 'bob@univ.edu',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue({ invitations: initialTeam.invitations });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TeamPanel eventId="ev-1" initialTeam={initialTeam} />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText('Quantum Coders')).toBeInTheDocument();
      expect(screen.getAllByText(/QNT-?999/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Alice Leader')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('bob@univ.edu')).toBeInTheDocument();
      });
      expect(screen.getByText('Cancel')).toBeInTheDocument();

      // Send new invite by email
      const input = screen.getByPlaceholderText(/teammate@university.edu/i);
      fireEvent.change(input, { target: { value: 'charlie@univ.edu' } });

      vi.mocked(api.post).mockResolvedValueOnce({
        success: true,
        invitation: {
          id: 'inv-sent-2',
          invitedEmail: 'charlie@univ.edu',
          status: 'PENDING',
        },
      });

      fireEvent.click(screen.getByText('Send Invite'));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/events/ev-1/teams/team-999/invite', {
          email: 'charlie@univ.edu',
          rollNumber: undefined,
        });
      });

      // Cancel Bob's invite
      vi.mocked(api.post).mockResolvedValueOnce({ success: true });
      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/events/ev-1/teams/team-999/invitations/inv-sent-1/cancel'
        );
      });
    });
  });

  describe('2. Organizer TeamsPanel: Roster Readiness, Member Answers & Invitations', () => {
    it('renders teams list with leader, readiness status, member answers button and invitations', async () => {
      const mockTeams = [
        {
          id: 'team-alpha',
          name: 'Team Alpha',
          code: 'ALP001',
          status: 'FORMING',
          leaderId: 'u-lead',
          isReady: true,
          leader: {
            userId: 'u-lead',
            fullName: 'Captain Kirk',
            email: 'kirk@enterprise.edu',
            role: 'LEADER',
          },
          members: [
            {
              userId: 'u-lead',
              fullName: 'Captain Kirk',
              email: 'kirk@enterprise.edu',
              role: 'LEADER',
              registration: {
                id: 'reg-lead',
                status: 'CONFIRMED',
                paymentStatus: 'NOT_REQUIRED',
                amountPaise: 0,
                approvalStatus: 'APPROVED',
                createdAt: new Date().toISOString(),
              },
              answers: {
                'q-track': {
                  label: 'Competition Track',
                  type: 'SINGLE_SELECT',
                  value: 'AI Automation',
                },
              },
            },
            {
              userId: 'u-spock',
              fullName: 'Mr Spock',
              email: 'spock@enterprise.edu',
              role: 'MEMBER',
              registration: {
                id: 'reg-spock',
                status: 'CONFIRMED',
                paymentStatus: 'NOT_REQUIRED',
                amountPaise: 0,
                approvalStatus: 'APPROVED',
                createdAt: new Date().toISOString(),
              },
            },
          ],
          invitations: [
            {
              id: 'inv-bones',
              status: 'PENDING',
              invitedEmail: 'bones@enterprise.edu',
              createdAt: new Date().toISOString(),
            },
          ],
          projectSubmission: {
            projectTitle: 'Warp Drive Controller',
            abstract: 'Real-time telemetry and warp core stabilizer.',
            repoUrl: 'https://github.com/starfleet/warp',
          },
        },
      ];

      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.includes('/teams')) {
          return { teams: mockTeams };
        }
        if (url.includes('/submissions')) {
          return { submissions: [] };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/organizer/events/ev-123/teams']}>
            <Routes>
              <Route path="/organizer/events/:eventId/teams" element={<TeamsPanel />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
        expect(screen.getByText('Code: ALP001')).toBeInTheDocument();
        expect(screen.getAllByText('Captain Kirk').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Mr Spock')).toBeInTheDocument();
        expect(screen.getByText('Roster Ready')).toBeInTheDocument();
        expect(screen.getByText('bones@enterprise.edu')).toBeInTheDocument();
        expect(screen.getByText('Project: Warp Drive Controller')).toBeInTheDocument();
        expect(screen.getByText('Answers')).toBeInTheDocument();
      });

      // Click Answers button to open modal
      fireEvent.click(screen.getByText('Answers'));

      await waitFor(() => {
        expect(screen.getByText('Registration Form Answers')).toBeInTheDocument();
        expect(screen.getByText('Competition Track')).toBeInTheDocument();
        expect(screen.getByText('AI Automation')).toBeInTheDocument();
      });
    });
  });
});
