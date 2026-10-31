import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { PassportPage } from '@/features/passport/PassportPage';
import { AuthenticatedQrImage } from '@/features/passport/AuthenticatedQrImage';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

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

// Mock Auth
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_student_1',
      fullName: 'Alice Student',
      email: 'alice@campus.edu',
      role: 'STUDENT',
      rollNumber: '22CS1001',
      department: 'Computer Science',
      year: 3,
      phone: '+91 9876543210',
      strikeCount: 0,
    },
    clerkUser: {
      fullName: 'Alice Student',
      imageUrl: 'https://example.com/avatar.png',
      primaryEmailAddress: { emailAddress: 'alice@campus.edu' },
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: false,
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

describe('Prompt 23 Fixes Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  describe('1. Profile Save Fixes', () => {
    it('payload contains year (not collegeYear) and success toast fires only after confirmed 2xx', async () => {
      const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({
        user: {
          id: 'usr_student_1',
          fullName: 'Alice Student Updated',
          rollNumber: '22CS1001',
          department: 'Computer Science',
          year: 4,
          phone: '+91 9876543210',
        },
      } as any);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Change year input to 4
      const yearInput = screen.getByLabelText(/College Year/i);
      fireEvent.change(yearInput, { target: { value: '4' } });

      // Click save
      const saveBtn = screen.getByRole('button', { name: /Save Profile/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledTimes(1);
      });

      // Verify payload contains year: 4 and does NOT contain collegeYear
      const [url, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
      expect(url).toBe('/me');
      expect(payload).toHaveProperty('year', 4);
      expect(payload).not.toHaveProperty('collegeYear');

      // Verify success toast fired
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Profile Updated',
          })
        );
      });
    });

    it('on 401 or 500 error, no success toast appears', async () => {
      vi.spyOn(api, 'patch').mockRejectedValueOnce(
        new ApiError('UNAUTHENTICATED', 'Authentication required', 401)
      );

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const saveBtn = screen.getByRole('button', { name: /Save Profile/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        // Must NOT show 'Profile Updated' or 'Profile Saved (Demo)'
        expect(toast).not.toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Profile Updated',
          })
        );
        expect(toast).not.toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Profile Saved (Demo)',
          })
        );
      });
    });

    it('surfaces roll-number conflict (409) as an inline field error', async () => {
      vi.spyOn(api, 'patch').mockRejectedValueOnce(
        new ApiError('CONFLICT', 'Roll number 22CS1001 is already registered to another user.', 409)
      );

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const saveBtn = screen.getByRole('button', { name: /Save Profile/i });
      fireEvent.click(saveBtn);

      const inlineError = await screen.findByTestId('roll-number-error');
      expect(inlineError).toBeInTheDocument();
      expect(inlineError).toHaveTextContent(/already registered/i);
    });
  });

  describe('2. Passport Data & Error Handling Fixes', () => {
    const mockRealEventId = '69ce65df-439d-483c-ae19-04197c477d63';
    const mockRealRegId = '7e6725f4-9f09-4e4c-a72f-d78d72978eec';

    it('calls /me/registrations and maps real UUIDs, without any evt_sample_* fallback', async () => {
      const getSpy = vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url === '/me/registrations') {
          return {
            items: [
              {
                registration: {
                  id: mockRealRegId,
                  userId: 'usr_student_1',
                  eventId: mockRealEventId,
                  status: 'CONFIRMED',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                event: {
                  id: mockRealEventId,
                  title: 'Real Campus Systems Sprint 2026',
                  slug: 'campus-systems-2026',
                  startAt: new Date(Date.now() + 86400000).toISOString(),
                  endAt: new Date(Date.now() + 172800000).toISOString(),
                  category: 'Hackathon',
                  isPaid: false,
                  pricePaise: 0,
                },
                ticket: {
                  id: 'tkt_real_1',
                  registrationId: mockRealRegId,
                  userId: 'usr_student_1',
                  token: 'ev_tok_32_character_real_pass_code',
                  status: 'VALID',
                  createdAt: new Date().toISOString(),
                },
              },
            ],
          } as any;
        }
        if (url === '/me/passport') {
          return { passport: [] } as any;
        }
        return {} as any;
      });

      vi.spyOn(api, 'getBlob').mockResolvedValue(new Blob(['png-bytes'], { type: 'image/png' }));
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:3000/qr-blob-url');
      global.URL.revokeObjectURL = vi.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PassportPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify endpoint called was /me/registrations, not /me/tickets
      await waitFor(() => {
        expect(getSpy).toHaveBeenCalledWith('/me/registrations', expect.anything());
        expect(getSpy).not.toHaveBeenCalledWith('/me/tickets', expect.anything());
      });

      // Verify card rendered with real event title and real token
      expect(await screen.findByText('Real Campus Systems Sprint 2026')).toBeInTheDocument();
      expect(screen.getByText('ev_tok_32_character_real_pass_code')).toBeInTheDocument();

      // Ensure no request ever contains evt_sample_*
      for (const call of getSpy.mock.calls) {
        expect(call[0]).not.toContain('evt_sample');
      }
    });

    it('renders empty state when no upcoming passes exist', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url === '/me/registrations') return { items: [] } as any;
        if (url === '/me/passport') return { passport: [] } as any;
        return {} as any;
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PassportPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(
        await screen.findByText(/You have no active upcoming event passes/i)
      ).toBeInTheDocument();
    });

    it('renders real error state with Retry button on API failure', async () => {
      vi.spyOn(api, 'get').mockRejectedValue(new Error('Network error loading passport'));

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PassportPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(await screen.findByTestId('passport-error-state')).toBeInTheDocument();
      expect(screen.getByTestId('passport-retry-button')).toBeInTheDocument();
    });
  });

  describe('3. Authenticated QR Image Fixes', () => {
    it('fetches QR as Blob and renders blob URL with testid', async () => {
      const mockBlob = new Blob(['mock-png-data'], { type: 'image/png' });
      const getBlobSpy = vi.spyOn(api, 'getBlob').mockResolvedValueOnce(mockBlob);
      const createObjectURLSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:http://localhost:3000/mock-qr-blob');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const { unmount } = render(
        <AuthenticatedQrImage registrationId="reg_test_uuid_123" />
      );

      const qrImg = await screen.findByTestId('passport-qr-image');
      expect(qrImg).toBeInTheDocument();
      expect(qrImg.getAttribute('src')).toBe('blob:http://localhost:3000/mock-qr-blob');
      expect(getBlobSpy).toHaveBeenCalledWith(
        '/tickets/reg_test_uuid_123/qr.png',
        expect.anything()
      );

      // Verify revokeObjectURL is called on unmount
      unmount();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost:3000/mock-qr-blob');
    });

    it('renders error state with Retry button when QR fetch fails', async () => {
      vi.spyOn(api, 'getBlob').mockRejectedValueOnce(new Error('401 Unauthorized'));

      render(<AuthenticatedQrImage registrationId="reg_failing_uuid" />);

      const errorContainer = await screen.findByTestId('passport-qr-error');
      expect(errorContainer).toBeInTheDocument();
      expect(screen.getByTestId('passport-qr-retry')).toBeInTheDocument();
    });
  });
});
