import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RegisterDialog } from '@/features/register/RegisterDialog';
import { api, ApiError } from '@/lib/api';
import { QuestionType, FormQuestionDef } from '@eventora/shared';

vi.mock('@clerk/clerk-react', () => ({
  SignInButton: ({ children }: any) => <div data-testid="clerk-signin-btn">{children}</div>,
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

// Mock complete student user
const mockStudentUser = {
  id: 'usr_student_verified',
  fullName: 'Alan Turing',
  email: 'alan@cambridge.edu',
  role: 'STUDENT' as const,
  rollNumber: '22CS0901',
  collegeName: 'University College of Computing',
  department: 'Computer Science & Engineering',
  year: 4,
  collegeYear: 4,
  program: 'B.Tech CSE',
  course: 'B.Tech CSE',
  phone: '9876543210',
  profileComplete: true,
  missingFields: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockIncompleteStudentUser = {
  id: 'usr_student_incomplete',
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
  profileComplete: false,
  missingFields: ['fullName', 'rollNumber', 'collegeName', 'department', 'year', 'program', 'phone'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

let currentAuthUser: any = mockStudentUser;
let currentIsSignedIn: boolean = true;

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: currentIsSignedIn,
    isLoaded: true,
    user: currentAuthUser,
    clerkUser: currentAuthUser
      ? {
          fullName: currentAuthUser.fullName,
          imageUrl: 'https://example.com/avatar.png',
          primaryEmailAddress: { emailAddress: currentAuthUser.email },
        }
      : null,
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: false,
    refetchUser: vi.fn(),
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

describe('Student Registration Journey End-to-End Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    currentAuthUser = mockStudentUser;
    currentIsSignedIn = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const mockQuestions: FormQuestionDef[] = [
    {
      id: 'q_track',
      label: 'Selected Track',
      description: 'Choose your participation domain',
      type: QuestionType.SHORT_TEXT,
      required: true,
      placeholder: 'e.g. AI / Web3',
      orderIndex: 0,
    },
    {
      id: 'q_github',
      label: 'GitHub Profile URL',
      description: 'Link to your public repositories',
      type: QuestionType.URL,
      required: false,
      placeholder: 'https://github.com/...',
      orderIndex: 1,
    },
    {
      id: 'q_experience_years',
      label: 'Years of Coding Experience',
      type: QuestionType.NUMBER,
      required: true,
      placeholder: '0',
      orderIndex: 2,
    },
  ];

  it('1. Authentication Guard: Prompts unauthenticated students to sign in', async () => {
    currentIsSignedIn = false;
    currentAuthUser = null;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_journey_1"
            eventTitle="Autonomous Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('auth-required-view')).toBeInTheDocument();
    expect(screen.getByText(/Sign in to Register/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign In with Student Account/i)).toBeInTheDocument();
  });

  it('2. Profile Incomplete: Prompts mandatory academic details before registration', async () => {
    currentIsSignedIn = true;
    currentAuthUser = mockIncompleteStudentUser;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_journey_1"
            eventTitle="Autonomous Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('profile-incomplete-card')).toBeInTheDocument();
    expect(screen.getByText(/Complete Your Student Profile/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('22CS01042')).toBeInTheDocument();
    expect(screen.getByText(/Open Profile Page/i)).toBeInTheDocument();
  });

  it('3. Verified Profile Pre-fill & Custom Questionnaire Rendering', async () => {
    currentIsSignedIn = true;
    currentAuthUser = mockStudentUser;

    vi.spyOn(api, 'get').mockResolvedValueOnce({
      questions: mockQuestions,
      formVersion: 2,
      formPublished: true,
      registrationMode: 'INDIVIDUAL',
      approvalRequired: false,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_journey_1"
            eventTitle="Autonomous Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verified profile prefill card is visible
    await waitFor(() => {
      expect(screen.getByTestId('profile-verified-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.getByText('22CS0901')).toBeInTheDocument();
    expect(screen.getByText(/University College of Computing/i)).toBeInTheDocument();

    // Event-specific questions are rendered
    await waitFor(() => {
      expect(screen.getByText('Selected Track')).toBeInTheDocument();
    });
    expect(screen.getByText('GitHub Profile URL')).toBeInTheDocument();
    expect(screen.getByText('Years of Coding Experience')).toBeInTheDocument();
  });

  it('4. Two-Step Review & Answer Preservation: Navigating backward does not lose answers', async () => {
    currentIsSignedIn = true;
    currentAuthUser = mockStudentUser;

    vi.spyOn(api, 'get').mockResolvedValue({
      questions: mockQuestions,
      formVersion: 2,
      formPublished: true,
      registrationMode: 'INDIVIDUAL',
      approvalRequired: false,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_journey_1"
            eventTitle="Autonomous Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. AI / Web3')).toBeInTheDocument();
    });

    // Enter partial input
    const trackInput = screen.getByPlaceholderText('e.g. AI / Web3');
    fireEvent.change(trackInput, { target: { value: 'AI Agents' } });

    // Leave experience empty and try to proceed to review
    const proceedBtn = screen.getByRole('button', { name: /confirm registration/i });
    fireEvent.click(proceedBtn);

    // Blocked on form due to required number field
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });

    // Provide the required experience number
    const expInput = screen.getByPlaceholderText('0');
    fireEvent.change(expInput, { target: { value: '3' } });

    // Now proceed to review
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));

    // Review Screen is displayed!
    await waitFor(() => {
      expect(screen.getByTestId('registration-review-view')).toBeInTheDocument();
    });
    expect(screen.getByText('AI Agents')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Navigate backward
    const backBtn = screen.getByTestId('back-to-form-btn');
    fireEvent.click(backBtn);

    // Form screen is shown again and answers are fully preserved
    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. AI / Web3')).toHaveValue('AI Agents');
      expect(screen.getByPlaceholderText('0')).toHaveValue(3);
    });
  });

  it('5. Full End-to-End Registration, Review, Confirmation & Ticket Access', async () => {
    currentIsSignedIn = true;
    currentAuthUser = mockStudentUser;

    const simpleQuestion: FormQuestionDef = {
      id: 'q_track',
      label: 'Preferred Project Track',
      type: QuestionType.SHORT_TEXT,
      required: true,
      placeholder: 'e.g. AI / Web3 / HealthTech',
      orderIndex: 0,
    };

    vi.spyOn(api, 'get').mockResolvedValue({
      questions: [simpleQuestion],
      formVersion: 3,
      formPublished: true,
      registrationMode: 'INDIVIDUAL',
      approvalRequired: false,
    });

    const mockPost = vi.spyOn(api, 'post').mockResolvedValueOnce({
      outcome: 'CONFIRMED',
      status: 'CONFIRMED',
      registration: {
        id: 'reg_journey_123',
        status: 'CONFIRMED',
        formVersion: 3,
      },
      ticket: {
        id: 'tkt_journey_456',
        token: 'PASS-AUTON-8821',
        status: 'ACTIVE',
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_journey_1"
            eventTitle="Autonomous Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. AI / Web3 / HealthTech')).toBeInTheDocument();
    });

    const trackInput = screen.getByPlaceholderText('e.g. AI / Web3 / HealthTech');
    fireEvent.change(trackInput, { target: { value: 'Artificial Intelligence' } });

    // Click "Review & Confirm Registration"
    const proceedBtn = screen.getByRole('button', { name: /confirm registration/i });
    fireEvent.click(proceedBtn);

    // Review Screen is displayed!
    await waitFor(() => {
      expect(screen.getByTestId('registration-review-view')).toBeInTheDocument();
    });
    expect(screen.getByText(/Review Registration Details/i)).toBeInTheDocument();
    expect(screen.getByText('Artificial Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();

    // Verify navigating backward preserves all answers!
    const backBtn = screen.getByTestId('back-to-form-btn');
    fireEvent.click(backBtn);

    // Back on form screen: answer is still there!
    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. AI / Web3 / HealthTech')).toHaveValue('Artificial Intelligence');
    });

    // Advance to review again
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    await waitFor(() => {
      expect(screen.getByTestId('registration-review-view')).toBeInTheDocument();
    });

    // Final confirmation submission
    const finalConfirmBtn = screen.getByTestId('confirm-registration-btn');
    fireEvent.click(finalConfirmBtn);

    // API post called with answers
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/events/evt_journey_1/registrations', expect.objectContaining({
        answers: { q_track: 'Artificial Intelligence' },
      }));
    });

    // Confirmed outcome with ticket token displayed
    await waitFor(() => {
      expect(screen.getByTestId('registration-confirmed-view')).toBeInTheDocument();
      expect(screen.getByText('PASS-AUTON-8821')).toBeInTheDocument();
      expect(screen.getByText(/Add to Calendar/i)).toBeInTheDocument();
    });
  });

  it('6. Duplicate Registration Guard: Handles 409 Conflict gracefully', async () => {
    currentIsSignedIn = true;
    currentAuthUser = mockStudentUser;

    vi.spyOn(api, 'get').mockResolvedValue({
      questions: [],
      formVersion: 1,
      formPublished: true,
      registrationMode: 'INDIVIDUAL',
    });

    vi.spyOn(api, 'post').mockRejectedValueOnce(
      new ApiError('CONFLICT', 'You are already registered for this event.', 409)
    );

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_journey_1"
            eventTitle="Autonomous Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm registration/i })).toBeInTheDocument();
    });

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    await waitFor(() => {
      expect(screen.getByTestId('registration-review-view')).toBeInTheDocument();
    });

    // Confirm
    fireEvent.click(screen.getByTestId('confirm-registration-btn'));

    // Server error banner displayed
    await waitFor(() => {
      expect(screen.getByTestId('registration-server-error')).toHaveTextContent(/already registered for this event/i);
    });
  });

  it('7. Waitlist Queue Handling: Displays waitlist position when event is at capacity', async () => {
    currentIsSignedIn = true;
    currentAuthUser = mockStudentUser;

    vi.spyOn(api, 'get').mockResolvedValue({
      questions: [],
      formVersion: 1,
      formPublished: true,
      registrationMode: 'INDIVIDUAL',
    });

    vi.spyOn(api, 'post').mockResolvedValueOnce({
      outcome: 'WAITLISTED',
      status: 'WAITLISTED',
      position: 14,
      registration: {
        id: 'reg_waitlist_1',
        status: 'WAITLISTED',
        position: 14,
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_journey_1"
            eventTitle="Autonomous Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm registration/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    await waitFor(() => {
      expect(screen.getByTestId('registration-review-view')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirm-registration-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('registration-waitlisted-view')).toBeInTheDocument();
      expect(screen.getByText('#14')).toBeInTheDocument();
    });
  });

  it('8. Paid Event Workflow: Transitions to Sandbox Checkout for test payment', async () => {
    currentIsSignedIn = true;
    currentAuthUser = mockStudentUser;

    vi.spyOn(api, 'get').mockResolvedValue({
      questions: [],
      formVersion: 1,
      formPublished: true,
      registrationMode: 'INDIVIDUAL',
    });

    vi.spyOn(api, 'post').mockResolvedValueOnce({
      outcome: 'PAYMENT_REQUIRED',
      status: 'PAYMENT_REQUIRED',
      paymentRequired: true,
      registration: {
        id: 'reg_paid_1',
        status: 'PAYMENT_REQUIRED',
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_paid_1"
            eventTitle="AI Masterclass & Bootcamp"
            pricePaise={49900}
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Initial button indicates payment
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Proceed to Pay ₹499\.00/i })).toBeInTheDocument();
    });

    // Advance to review
    fireEvent.click(screen.getByRole('button', { name: /Proceed to Pay ₹499\.00/i }));
    await waitFor(() => {
      expect(screen.getByTestId('registration-review-view')).toBeInTheDocument();
      expect(screen.getByText('₹499.00')).toBeInTheDocument();
    });

    // Confirm and proceed to pay
    fireEvent.click(screen.getByTestId('confirm-registration-btn'));

    // Sandbox checkout screen is loaded
    await waitFor(() => {
      expect(screen.getByTestId('sandbox-checkout')).toBeInTheDocument();
      expect(screen.getByText(/Campus Payment Sandbox/i)).toBeInTheDocument();
    });
  });

  it('9. Team Registration Mode: Organizes and registers team with auto-generated invite code', async () => {
    currentIsSignedIn = true;
    currentAuthUser = mockStudentUser;

    vi.spyOn(api, 'get').mockResolvedValue({
      questions: [],
      formVersion: 1,
      formPublished: true,
      registrationMode: 'BOTH',
      minTeamSize: 2,
      maxTeamSize: 4,
    });

    const mockTeamPost = vi.spyOn(api, 'post').mockResolvedValueOnce({
      team: {
        id: 'team_hack_99',
        name: 'The Quantum Hackers',
        inviteCode: 'HACK-9999',
      },
      registration: {
        id: 'reg_team_lead_1',
        status: 'CONFIRMED',
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RegisterDialog
            eventId="evt_hack_comp"
            eventTitle="Inter-College Hackathon 2026"
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Create Team')).toBeInTheDocument();
    });

    // Switch to Team mode
    fireEvent.click(screen.getByText('Create Team'));

    const teamInput = screen.getByPlaceholderText('e.g. Code Ninjas');
    fireEvent.change(teamInput, { target: { value: 'The Quantum Hackers' } });

    // Click "Review & Register Team"
    fireEvent.click(screen.getByRole('button', { name: /Register Team/i }));

    // Review Screen shows Team Lead Mode
    await waitFor(() => {
      expect(screen.getByTestId('registration-review-view')).toBeInTheDocument();
      expect(screen.getByText(/The Quantum Hackers/i)).toBeInTheDocument();
    });

    // Final confirmation
    fireEvent.click(screen.getByTestId('confirm-registration-btn'));

    await waitFor(() => {
      expect(mockTeamPost).toHaveBeenCalledWith('/events/evt_hack_comp/teams', expect.objectContaining({
        name: 'The Quantum Hackers',
      }));
      expect(screen.getByTestId('registration-confirmed-view')).toBeInTheDocument();
      expect(screen.getByText('HACK-9999')).toBeInTheDocument();
    });
  });
});
