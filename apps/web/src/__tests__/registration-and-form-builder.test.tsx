import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { RegisterDialog } from '@/features/register/RegisterDialog';
import { FormBuilderPage } from '@/features/builder/FormBuilderPage';
import { GateOps } from '@/features/organizer/GateOps';
import { api } from '@/lib/api';
import { QuestionType } from '@eventora/shared';

vi.mock('@clerk/clerk-react', () => ({
  SignInButton: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/use-toast', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
  useToast: () => ({ toast: vi.fn(), toasts: [] }),
}));

vi.mock('@/components/turnstile-widget', () => ({
  TurnstileWidget: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button
      type="button"
      data-testid="turnstile-mock"
      onClick={() => onSuccess('mock-turnstile-token')}
    >
      Turnstile Pass
    </button>
  ),
}));

// Mock complete auth user
const mockCompleteUser = {
  id: 'usr_complete_1',
  fullName: 'Ada Lovelace',
  email: 'ada@computing.edu',
  role: 'STUDENT' as const,
  rollNumber: '22CS01042',
  collegeName: 'Imperial College of Technology',
  department: 'Computer Science',
  year: 4,
  collegeYear: 4,
  program: 'B.Tech CS',
  course: 'B.Tech CS',
  phone: '9876543210',
  strikeCount: 0,
  profileComplete: true,
  missingFields: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockIncompleteUser = {
  id: 'usr_incomplete_1',
  fullName: '',
  email: 'newbie@campus.edu',
  role: 'STUDENT' as const,
  rollNumber: '',
  collegeName: '',
  department: '',
  year: null,
  collegeYear: null,
  program: '',
  course: '',
  phone: '',
  strikeCount: 0,
  profileComplete: false,
  missingFields: ['fullName', 'rollNumber', 'collegeName', 'department', 'year', 'program', 'phone'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

let activeAuthUser: any = mockCompleteUser;

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: activeAuthUser,
    clerkUser: {
      fullName: activeAuthUser.fullName,
      imageUrl: 'https://example.com/avatar.png',
      primaryEmailAddress: { emailAddress: activeAuthUser.email },
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: true,
    refetchUser: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/lib/socket', () => ({
  useSocketEvent: vi.fn(),
  getSocket: () => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  }),
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

describe('Complete Registration, Form Builder & Attendee Management UI Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    activeAuthUser = mockCompleteUser;
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  // --- SUITE 1: Student Academic Profile UI ---
  describe('1. Student Academic Profile UI', () => {
    it('ProfilePage displays verified academic profile badge and full fields', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText(/Student Academic Profile/i)).toBeInTheDocument();
      expect(screen.getByText(/Profile Complete/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByDisplayValue('22CS01042')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Imperial College of Technology')).toBeInTheDocument();
      expect(screen.getByDisplayValue('B.Tech CS')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Computer Science')).toBeInTheDocument();
    });

    it('shows action-required badge when user profile is missing fields', async () => {
      activeAuthUser = mockIncompleteUser;

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText(/Action Required: Missing Info/i)).toBeInTheDocument();
    });
  });

  // --- SUITE 2: Dynamic Form Builder UI ---
  describe('2. Organizer Form Builder Page UI', () => {
    it('FormBuilderPage renders templates button, version badge v2, and published status', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/form')) {
          return {
            eventId: 'mock-event-1',
            frozen: false,
            formVersion: 2,
            formPublished: true,
            registrationMode: 'INDIVIDUAL',
            registeredCount: 0,
            questions: [
              {
                id: 'q1',
                eventId: 'mock-event-1',
                label: 'GitHub Portfolio URL',
                type: QuestionType.URL,
                required: true,
                position: 1,
                archived: false,
                addedAfterFreeze: false,
              },
            ],
          };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/events/mock-event-1/form']}>
            <Routes>
              <Route path="/events/:eventId/form" element={<FormBuilderPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Registration Form Builder')).toBeInTheDocument();
      });

      expect(screen.getByText('v2')).toBeInTheDocument();
      expect(screen.getByText('Published')).toBeInTheDocument();
      expect(screen.getByText('Templates')).toBeInTheDocument();
      expect(screen.getByDisplayValue('GitHub Portfolio URL')).toBeInTheDocument();
    });
  });

  // --- SUITE 3: Student Registration Dialog UI ---
  describe('3. Student Registration Experience & New Question Types', () => {
    it('RegisterDialog displays verified profile card and renders all question types', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/form')) {
          return {
            questions: [
              {
                id: 'q_dropdown',
                label: 'T-Shirt Size',
                type: QuestionType.DROPDOWN,
                required: true,
                options: ['S', 'M', 'L', 'XL'],
                position: 1,
              },
              {
                id: 'q_yesno',
                label: 'Require Campus Hostel Stay?',
                type: QuestionType.YES_NO,
                required: false,
                position: 2,
              },
              {
                id: 'q_info',
                label: 'Hackathon Code of Conduct',
                description: 'Participants must follow university rules.',
                type: QuestionType.INSTRUCTION,
                position: 3,
              },
            ],
            formVersion: 1,
            formPublished: true,
            registrationMode: 'INDIVIDUAL',
            isCompetition: false,
          };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <RegisterDialog
            eventId="evt-1"
            eventTitle="Campus Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('profile-verified-card')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('T-Shirt Size')).toBeInTheDocument();
      });

      expect(screen.getByText(/Verified Academic Profile/i)).toBeInTheDocument();
      expect(screen.getByText('Require Campus Hostel Stay?')).toBeInTheDocument();
      expect(screen.getByText('Hackathon Code of Conduct')).toBeInTheDocument();
    });

    it('prompts inline profile completion when student profile is incomplete', async () => {
      activeAuthUser = mockIncompleteUser;

      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/form')) {
          return {
            questions: [],
            formVersion: 1,
            formPublished: true,
            registrationMode: 'INDIVIDUAL',
          };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <RegisterDialog
            eventId="evt-1"
            eventTitle="Campus Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('profile-incomplete-card')).toBeInTheDocument();
      });

      expect(screen.getByText(/Complete Your Student Profile/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/22CS01042/i)).toBeInTheDocument();
    });

    it('shows team registration mode options when event is a competition', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/form')) {
          return {
            questions: [],
            formVersion: 1,
            formPublished: true,
            registrationMode: 'BOTH',
            isCompetition: true,
            minTeamSize: 2,
            maxTeamSize: 4,
          };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <RegisterDialog
            eventId="evt-comp-1"
            eventTitle="Annual Hackathon Competition"
            isOpen={true}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Registration Mode')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Individual' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Team' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Join Team' })).toBeInTheDocument();
    });
  });

  // --- SUITE 4: Gate Operations & Attendee Directory UI ---
  describe('4. Organizer Attendee Directory & 6-Section Deep Inspection', () => {
    it('GateOps renders attendee directory filters and deep inspection modal', async () => {
      const mockUser = {
        id: 'u1',
        fullName: 'Srinivasa Ramanujan',
        email: 'ramanujan@math.edu',
        rollNumber: 'MATH001',
        department: 'Mathematics',
        year: 3,
        program: 'B.Sc Mathematics',
        phone: '+91 99999 11111',
        collegeName: 'Trinity College of Science',
      };

      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/attendees/reg-001')) {
          return {
            personalProfile: mockUser,
            registration: {
              id: 'reg-001',
              status: 'CONFIRMED',
              approvalStatus: 'APPROVED',
              formVersion: 1,
              createdAt: new Date().toISOString(),
            },
            formResponses: [
              {
                questionId: 'q1',
                label: 'GitHub URL',
                type: QuestionType.URL,
                value: 'https://github.com/ramanujan',
              },
            ],
            team: {
              id: 'tm-1',
              name: 'Team Infinite',
              inviteCode: 'INF999',
              isLeader: true,
              members: [
                {
                  id: 'u1',
                  fullName: 'Srinivasa Ramanujan',
                  email: 'ramanujan@math.edu',
                  role: 'LEADER',
                  invitationStatus: 'ACCEPTED',
                },
              ],
            },
            payment: {
              status: 'PAID',
              amountPaise: 0,
              provider: 'SANDBOX',
              orderId: null,
              isTestMode: true,
            },
            gateTelemetry: {
              checkedIn: false,
              checkedInAt: null,
              volunteerName: null,
              gateName: null,
            },
          };
        }
        if (url.includes('/form/responses')) {
          return {
            items: [
              {
                registrationId: 'reg-001',
                studentName: 'Srinivasa Ramanujan',
                rollNumber: 'MATH001',
                email: 'ramanujan@math.edu',
                ticketStatus: 'VALID',
                status: 'CONFIRMED',
                paymentStatus: 'PAID',
                registeredAt: new Date().toISOString(),
                user: mockUser,
                answers: {},
              },
            ],
            total: 1,
          };
        }
        if (url.includes('/stats')) {
          return {
            checkedIn: 0,
            totalCapacity: 100,
            attendanceRate: 0,
          };
        }
        if (url.includes('/passkeys')) {
          return { passkeys: [] };
        }
        return {};
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/organizer/events/evt-1/gate']}>
            <Routes>
              <Route path="/organizer/events/:eventId/gate" element={<GateOps />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Srinivasa Ramanujan')).toBeInTheDocument();
      });

      // Verify filters exist
      expect(screen.getByText('All Departments')).toBeInTheDocument();
      expect(screen.getByText('All Years')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search name, roll, email/i)).toBeInTheDocument();

      // Click on attendee row to open deep inspection modal
      const attendeeRow = screen.getByText('Srinivasa Ramanujan');
      fireEvent.click(attendeeRow);

      await waitFor(() => {
        expect(screen.getByText(/Attendee Record & Verification/i)).toBeInTheDocument();
      });

      // Verify 6 inspection sections
      await waitFor(() => {
        expect(screen.getByText(/1\. Student Academic Profile/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/2\. Event Registration Details/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. Custom Form Responses/i)).toBeInTheDocument();
      expect(screen.getByText(/4\. Team Information & Roster/i)).toBeInTheDocument();
      expect(screen.getByText(/5\. Payment & Settlement/i)).toBeInTheDocument();
      expect(screen.getByText(/6\. Gate Check-in Telemetry/i)).toBeInTheDocument();

      // Verify personal profile details
      expect(screen.getByText('Trinity College of Science')).toBeInTheDocument();
      expect(screen.getByText('Team Infinite')).toBeInTheDocument();
      expect(screen.getByText(/Sandbox \/ Test Mode Only/i)).toBeInTheDocument();
    });
  });
});
