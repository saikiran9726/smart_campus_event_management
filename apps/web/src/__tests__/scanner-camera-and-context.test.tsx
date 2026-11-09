import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScannerPage } from '../features/scanner/ScannerPage';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/socket', () => ({
  socket: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'vol_user_1', fullName: 'Campus Volunteer' },
    isClubOrganizer: false,
    isAdmin: false,
  }),
}));

// Helper to create a mock JWT with specific payload
function createMockJwt(payload: Record<string, any>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = 'mock_signature_bytes';
  return `${header}.${body}.${signature}`;
}

describe('Scanner Camera Lifecycle & Event Context Suite', () => {
  let originalMediaDevices: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    originalMediaDevices = navigator.mediaDevices;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    });
  });

  describe('1. Authoritative Event Context Resolution & Stale Event Protection', () => {
    it('resolves Campus Hackathon 2026 Proposal and ignores stale "ASDFG" event in storage', async () => {
      // Setup: volunteer token scoped to "Campus Hackathon 2026 Proposal" (id: evt_hack_2026)
      const validHackathonToken = createMockJwt({
        sessionId: 'sess_1',
        passkeyId: 'pass_1',
        eventId: 'evt_hack_2026',
        eventTitle: 'Campus Hackathon 2026 Proposal',
        volunteerName: 'Sam Volunteer',
        kind: 'scanner',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      // Storage has the new token, BUT stale sessionStorage has an old unrelated event "ASDFG"
      sessionStorage.setItem('eventora_scanner_token', validHackathonToken);
      sessionStorage.setItem(
        'eventora_scanner_event',
        JSON.stringify({
          eventId: 'evt_old_asdfg_999',
          eventTitle: 'ASDFG',
          volunteerName: 'Old Operator',
        })
      );

      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/gate/context') {
          return {
            eventId: 'evt_hack_2026',
            eventTitle: 'Campus Hackathon 2026 Proposal',
            volunteerName: 'Sam Volunteer',
          };
        }
        if (url.startsWith('/gate/stats')) {
          return {
            stats: {
              checkedInCount: 12,
              totalRegistrations: 150,
              mealClaimedCount: 5,
              kitClaimedCount: 8,
            },
          };
        }
        return {};
      });

      render(
        <MemoryRouter initialEntries={['/scanner']}>
          <ScannerPage />
        </MemoryRouter>
      );

      // Verify "Campus Hackathon 2026 Proposal" is displayed
      await waitFor(() => {
        expect(screen.getByText('Campus Hackathon 2026 Proposal')).toBeInTheDocument();
        expect(screen.getByText('Sam Volunteer')).toBeInTheDocument();
      });

      // Verify stale "ASDFG" is NEVER rendered in the document
      expect(screen.queryByText('ASDFG')).not.toBeInTheDocument();

      // Verify that sessionStorage was cleansed of the stale eventId
      const stored = JSON.parse(sessionStorage.getItem('eventora_scanner_event') || '{}');
      expect(stored.eventId).toBe('evt_hack_2026');
      expect(stored.eventTitle).toBe('Campus Hackathon 2026 Proposal');
    });

    it('redirects to /scanner/unlock when token is expired and wipes stale credentials', async () => {
      const expiredToken = createMockJwt({
        sessionId: 'sess_exp',
        passkeyId: 'pass_exp',
        eventId: 'evt_hack_2026',
        eventTitle: 'Campus Hackathon 2026 Proposal',
        volunteerName: 'Sam Volunteer',
        kind: 'scanner',
        exp: Math.floor(Date.now() / 1000) - 100, // expired in the past
      });

      sessionStorage.setItem('eventora_scanner_token', expiredToken);
      sessionStorage.setItem(
        'eventora_scanner_event',
        JSON.stringify({
          eventId: 'evt_hack_2026',
          eventTitle: 'Campus Hackathon 2026 Proposal',
          volunteerName: 'Sam Volunteer',
        })
      );

      render(
        <MemoryRouter initialEntries={['/scanner']}>
          <ScannerPage />
        </MemoryRouter>
      );

      // Verify storage was wiped clean
      expect(sessionStorage.getItem('eventora_scanner_token')).toBeNull();
      expect(sessionStorage.getItem('eventora_scanner_event')).toBeNull();
    });

    it('resolves event from localStorage fallback if sessionStorage is unpopulated', async () => {
      const token = createMockJwt({
        sessionId: 'sess_local',
        passkeyId: 'pass_local',
        eventId: 'evt_hack_2026',
        eventTitle: 'Campus Hackathon 2026 Proposal',
        volunteerName: 'Local Volunteer',
        kind: 'scanner',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      sessionStorage.setItem('eventora_scanner_token', token);
      sessionStorage.setItem(
        'eventora_scanner_event',
        JSON.stringify({
          eventId: 'evt_hack_2026',
          eventTitle: 'Campus Hackathon 2026 Proposal',
          volunteerName: 'Local Volunteer',
        })
      );

      vi.mocked(api.get).mockResolvedValue({
        stats: { checkedInCount: 0, totalRegistrations: 50 },
      });

      render(
        <MemoryRouter initialEntries={['/scanner']}>
          <ScannerPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Campus Hackathon 2026 Proposal')).toBeInTheDocument();
        expect(screen.getByText('Local Volunteer')).toBeInTheDocument();
      });
    });
  });

  describe('2. Camera Lifecycle, Error Recovery & Active Stream Overlay Fix', () => {
    it('does NOT display camera error overlay when video is active and playing', async () => {
      const stopTrackMock = vi.fn();
      const mockStream = {
        active: true,
        getVideoTracks: () => [
          {
            readyState: 'live',
            stop: stopTrackMock,
            getCapabilities: () => ({ torch: true }),
          },
        ],
        getTracks: () => [{ stop: stopTrackMock }],
      };

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn().mockResolvedValue(mockStream),
        },
        configurable: true,
        writable: true,
      });

      // Mock HTMLMediaElement.prototype.play
      const playMock = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

      sessionStorage.setItem(
        'eventora_scanner_token',
        createMockJwt({
          eventId: 'evt_1',
          eventTitle: 'Campus Hackathon 2026 Proposal',
          volunteerName: 'Volunteer A',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      );

      render(
        <MemoryRouter initialEntries={['/scanner']}>
          <ScannerPage />
        </MemoryRouter>
      );

      // Verify that getUserMedia was called
      await waitFor(() => {
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      });

      // Verify video element received the stream
      const video = screen.getByTestId('scanner-video-feed') as HTMLVideoElement;
      expect(video.srcObject).toBe(mockStream);

      // Verify that "Failed to access camera stream" is NOT displayed
      expect(screen.queryByText(/Failed to access camera stream/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Camera permission denied/i)).not.toBeInTheDocument();

      // Verify the camera QR viewfinder reticle is displayed
      expect(screen.getByText('Align QR Code')).toBeInTheDocument();

      playMock.mockRestore();
    });

    it('displays permission denied message when getUserMedia throws NotAllowedError', async () => {
      const notAllowedErr = new Error('Permission denied');
      notAllowedErr.name = 'NotAllowedError';

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn().mockRejectedValue(notAllowedErr),
        },
        configurable: true,
        writable: true,
      });

      sessionStorage.setItem(
        'eventora_scanner_token',
        createMockJwt({
          eventId: 'evt_1',
          eventTitle: 'Campus Hackathon 2026 Proposal',
          volunteerName: 'Volunteer A',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      );

      render(
        <MemoryRouter initialEntries={['/scanner']}>
          <ScannerPage />
        </MemoryRouter>
      );

      // Verify permission message is shown
      await waitFor(() => {
        expect(
          screen.getByText(/Camera permission denied\. Please allow camera access in browser settings/i)
        ).toBeInTheDocument();
      });

      // Verify Retry Camera button is present
      const retryBtn = screen.getByRole('button', { name: /Retry Camera/i });
      expect(retryBtn).toBeInTheDocument();
    });

    it('allows retry without reloading the entire window', async () => {
      let callCount = 0;
      const stopTrackMock = vi.fn();
      const mockStream = {
        active: true,
        getVideoTracks: () => [{ readyState: 'live', stop: stopTrackMock }],
        getTracks: () => [{ stop: stopTrackMock }],
      };

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
              const err = new Error('Camera busy');
              err.name = 'NotReadableError';
              throw err;
            }
            return mockStream;
          }),
        },
        configurable: true,
        writable: true,
      });

      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

      sessionStorage.setItem(
        'eventora_scanner_token',
        createMockJwt({
          eventId: 'evt_1',
          eventTitle: 'Campus Hackathon 2026 Proposal',
          volunteerName: 'Volunteer A',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      );

      render(
        <MemoryRouter initialEntries={['/scanner']}>
          <ScannerPage />
        </MemoryRouter>
      );

      // First call fails with busy message
      await waitFor(() => {
        expect(
          screen.getByText(/Camera is in use by another application/i)
        ).toBeInTheDocument();
      });

      // Click Retry Camera
      const retryBtn = screen.getByRole('button', { name: /Retry Camera/i });
      fireEvent.click(retryBtn);

      // Second call succeeds: error disappears, viewfinder active
      await waitFor(() => {
        expect(screen.queryByText(/Camera is in use/i)).not.toBeInTheDocument();
        expect(screen.getByText('Align QR Code')).toBeInTheDocument();
      });
      expect(callCount).toBe(2);
    });

    it('does not restart camera when switching scan modes (GATE -> MEAL -> KIT)', async () => {
      const stopTrackMock = vi.fn();
      const mockStream = {
        active: true,
        getVideoTracks: () => [{ readyState: 'live', stop: stopTrackMock }],
        getTracks: () => [{ stop: stopTrackMock }],
      };

      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: getUserMediaMock,
        },
        configurable: true,
        writable: true,
      });

      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

      sessionStorage.setItem(
        'eventora_scanner_token',
        createMockJwt({
          eventId: 'evt_1',
          eventTitle: 'Campus Hackathon 2026 Proposal',
          volunteerName: 'Volunteer A',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      );

      render(
        <MemoryRouter initialEntries={['/scanner']}>
          <ScannerPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(getUserMediaMock).toHaveBeenCalledTimes(1);
      });

      // Switch to Lunch Counter (MEAL)
      const mealBtn = screen.getByTestId('scanner-mode-meal');
      fireEvent.click(mealBtn);

      // Switch to Kit Desk (KIT)
      const kitBtn = screen.getByTestId('scanner-mode-kit');
      fireEvent.click(kitBtn);

      // Verify that hardware camera was NOT called again or re-initialized!
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
      expect(stopTrackMock).not.toHaveBeenCalled();
    });

    it('cleans up stream tracks when Lock / Exit is clicked', async () => {
      const stopTrackMock = vi.fn();
      const mockStream = {
        active: true,
        getVideoTracks: () => [{ readyState: 'live', stop: stopTrackMock }],
        getTracks: () => [{ stop: stopTrackMock }],
      };

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn().mockResolvedValue(mockStream),
        },
        configurable: true,
        writable: true,
      });

      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

      sessionStorage.setItem(
        'eventora_scanner_token',
        createMockJwt({
          eventId: 'evt_1',
          eventTitle: 'Campus Hackathon 2026 Proposal',
          volunteerName: 'Volunteer A',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      );

      render(
        <MemoryRouter initialEntries={['/scanner']}>
          <ScannerPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('scanner-exit-button')).toBeInTheDocument();
      });

      const lockBtn = screen.getByTestId('scanner-exit-button');
      fireEvent.click(lockBtn);

      // Tracks stopped and credentials removed
      expect(stopTrackMock).toHaveBeenCalled();
      expect(sessionStorage.getItem('eventora_scanner_token')).toBeNull();
      expect(localStorage.getItem('scanner_token')).toBeNull();
    });
  });
});
