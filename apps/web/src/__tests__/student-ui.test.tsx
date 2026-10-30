import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoveryPage } from '@/features/discovery/DiscoveryPage';
import { EventPage } from '@/features/event/EventPage';
import { RegisterDialog } from '@/features/register/RegisterDialog';
import { ClaimOfferPage } from '@/features/claim/ClaimOfferPage';
import { PassportPage } from '@/features/passport/PassportPage';
import { getSocket, emitSocketEvent } from '@/lib/socket';
import { QuestionType, FormQuestionDef } from '@eventora/shared';

// Mock Auth
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_student_1',
      fullName: 'John Student',
      email: 'john@campus.edu',
      role: 'ATTENDEE',
    },
    clerkUser: {
      fullName: 'John Student',
      imageUrl: 'https://example.com/avatar.png',
      primaryEmailAddress: { emailAddress: 'john@campus.edu' },
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: false,
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

describe('Student UI Comprehensive Flow Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('1. Discovery Feed: Skeletons, Cards & Empty State with Reset', () => {
    it('renders event cards and handles search empty state with working reset button', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <DiscoveryPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify event cards load
      await waitFor(() => {
        expect(screen.getAllByText('Autonomous AI Hackathon 2026')[0]).toBeInTheDocument();
      });

      // Type a query that matches no events
      const searchInput = screen.getByPlaceholderText(/search hackathons/i);
      fireEvent.change(searchInput, { target: { value: 'NonexistentEventXYZ123' } });

      // After debounce, empty state appears
      await waitFor(() => {
        expect(screen.getByText('No Campus Events Found')).toBeInTheDocument();
      });

      // Click "Reset Filters"
      const resetBtn = screen.getByRole('button', { name: /reset filters/i });
      fireEvent.click(resetBtn);

      // Verify cards reappear
      await waitFor(() => {
        expect(screen.getAllByText('Autonomous AI Hackathon 2026')[0]).toBeInTheDocument();
      });
    });
  });

  describe('2. Event Details: Live CTA Morphs to Join Waitlist on seats:update to 0', () => {
    it('CTA changes from Register Now to Join Waitlist when capacity reaches zero', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <EventPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Initially seats are remaining (15) -> "Register Now"
      await waitFor(() => {
        expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Register Now');
      });

      // Socket emits seats:update with 0 remaining
      act(() => {
        emitSocketEvent('seats:update', {
          eventId: 'evt_sample_ai',
          remaining: 0,
          capacity: 100,
        });
      });

      // CTA button text morphs to "Join Waitlist"
      await waitFor(() => {
        expect(screen.getByTestId('event-cta-button')).toHaveTextContent('Join Waitlist');
      });
    });
  });

  describe('3. Registration Dialog: Dynamic Validation with Regex Field', () => {
    it('validates a required regex field and blocks submission if invalid', async () => {
      const regexQuestion: FormQuestionDef = {
        id: 'q_roll_num',
        type: QuestionType.SHORT_TEXT,
        label: 'Roll Number Verification',
        required: true,
        orderIndex: 0,
        regexPattern: '^[0-9]{2}[A-Z]{2}[0-9]{4}$',
        regexErrorMessage: 'Roll number must be in format 22CS1049',
      };

      // Mock form data query returning this question
      queryClient.setQueryData(['events', 'evt_123', 'form'], [regexQuestion]);

      render(
        <QueryClientProvider client={queryClient}>
          <RegisterDialog
            eventId="evt_123"
            eventTitle="AI Workshop"
            isOpen={true}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      );

      // Wait for question to render
      const input = await screen.findByPlaceholderText('Your answer');
      expect(input).toBeInTheDocument();

      // Enter invalid roll number not matching regex
      fireEvent.change(input, { target: { value: 'invalid_format' } });

      // Click submit
      const submitBtn = screen.getByRole('button', { name: /confirm registration/i });
      fireEvent.click(submitBtn);

      // Error message is displayed and form submission is blocked
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/Roll number must be in format/i);
      });
    });
  });

  describe('4. Claim Offer Page: Expired State Handling', () => {
    it('shows expired state when offer countdown reaches zero', async () => {
      vi.useFakeTimers();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ClaimOfferPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify claim offer button is visible
      expect(screen.getByTestId('claim-button')).toBeInTheDocument();

      // Fast forward past the expiration window (20 minutes)
      act(() => {
        vi.advanceTimersByTime(1000 * 60 * 25);
      });

      // Verify expired state is rendered
      expect(screen.getByTestId('claim-expired-state')).toBeInTheDocument();
      expect(screen.getByText('Claim Window Expired')).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe('5. Passport Page: QR Image URL & LinkedIn Share Integration', () => {
    it('passport shows QR image sourcing from the correct /qr.png URL', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PassportPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const qrImage = await screen.findByTestId('passport-qr-image');
      expect(qrImage).toBeInTheDocument();
      expect(qrImage.getAttribute('src')).toMatch(/\/tickets\/reg_demo_1\/qr\.png$/);
    });

    it('LinkedIn share button writes pre-generated caption to clipboard and opens LinkedIn in a new tab', async () => {
      // Mock clipboard
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      // Mock window.open
      const openMock = vi.fn();
      window.open = openMock;

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PassportPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Switch to Certificates tab
      const certsTab = await screen.findByRole('tab', { name: /certificates/i });
      fireEvent.click(certsTab);

      // Click LinkedIn Share button
      const shareBtn = await screen.findByTestId('linkedin-share-button');
      fireEvent.click(shareBtn);

      // Verify navigator.clipboard.writeText was called with caption
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const copiedText = writeTextMock.mock.calls[0]![0];
      expect(copiedText).toContain('#EventoraOS');
      expect(copiedText).toContain('Smart Campus Systems Sprint 2026');

      // Verify window.open was called with LinkedIn URL and target _blank
      expect(openMock).toHaveBeenCalledTimes(1);
      const [url, target] = openMock.mock.calls[0]!;
      expect(url).toContain('linkedin.com/sharing/share-offsite');
      expect(target).toBe('_blank');
    });
  });
});
