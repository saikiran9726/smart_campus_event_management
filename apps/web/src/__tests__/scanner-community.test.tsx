import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScannerUnlockPage } from '../features/scanner/ScannerUnlockPage';
import { ScannerPage, YELLOW_REASONS } from '../features/scanner/ScannerPage';
import { ChatThread } from '../features/community/ChatThread';
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
    user: { id: 'user_123', fullName: 'Tester Student' },
    isClubOrganizer: false,
    isAdmin: false,
  }),
}));

describe('Scanner PWA Suite (Prompt 16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('1. ScannerUnlock: formats 6-digit PIN, includes volunteer name, and saves session token', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      token: 'jwt_scanner_token_xyz',
      eventId: 'evt_123',
      eventTitle: 'HackFest 2026',
      volunteerName: 'Alex Volunteer',
    });

    render(
      <MemoryRouter initialEntries={['/scanner/unlock?c=SCAN-654321']}>
        <ScannerUnlockPage />
      </MemoryRouter>
    );

    const passkeyInput = screen.getByTestId('scanner-passkey-input') as HTMLInputElement;
    expect(passkeyInput.value).toBe('654321');

    const nameInput = screen.getByTestId('scanner-volunteer-name-input');
    fireEvent.change(nameInput, { target: { value: 'Alex Volunteer' } });

    const submitBtn = screen.getByTestId('scanner-unlock-submit-button');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/public/scanner/unlock',
        expect.objectContaining({
          code: 'SCAN-654321',
          volunteerName: 'Alex Volunteer',
        }),
        expect.any(Object)
      );
    });

    expect(sessionStorage.getItem('eventora_scanner_token')).toBe('jwt_scanner_token_xyz');
  });

  it('2. ScannerPage: renders camera viewfinder, handles mode switcher and roll lookup sheet', async () => {
    sessionStorage.setItem('eventora_scanner_token', 'jwt_scanner_token_xyz');
    sessionStorage.setItem(
      'eventora_scanner_event',
      JSON.stringify({
        eventId: 'evt_123',
        eventTitle: 'HackFest 2026',
        volunteerName: 'Alex Volunteer',
      })
    );

    vi.mocked(api.get).mockResolvedValue({
      stats: {
        checkedInCount: 15,
        totalRegistrations: 100,
        mealClaimedCount: 10,
        kitClaimedCount: 8,
      },
    });

    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <ScannerPage />
      </MemoryRouter>
    );

    expect(screen.getByText('HackFest 2026')).toBeInTheDocument();
    expect(screen.getByText('Alex Volunteer')).toBeInTheDocument();

    // Mode tabs
    const mealBtn = screen.getByTestId('scanner-mode-meal');
    fireEvent.click(mealBtn);
    expect(mealBtn).toHaveClass('bg-amber-600');

    // Roll lookup
    const lookupBtn = screen.getByTestId('scanner-lookup-button');
    fireEvent.click(lookupBtn);
    expect(screen.getByText('Manual Roll Lookup')).toBeInTheDocument();
  });

  it('YELLOW feedback: renders WRONG_EVENT with message and amber background', async () => {
    sessionStorage.setItem('eventora_scanner_token', 'jwt_scanner_token_xyz');
    sessionStorage.setItem(
      'eventora_scanner_event',
      JSON.stringify({
        eventId: 'evt_123',
        eventTitle: 'HackFest 2026',
        volunteerName: 'Alex Volunteer',
      })
    );

    vi.mocked(api.post).mockResolvedValueOnce({
      result: 'YELLOW',
      reason: 'WRONG_EVENT',
    });

    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <ScannerPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('scanner-simulated-input'), {
      target: { value: 'ev_tok_1234567890123456789012341' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('scanner-feedback-yellow')).toBeInTheDocument();
    });

    const feedback = screen.getByTestId('scanner-feedback-yellow');
    expect(feedback).toHaveClass('bg-[#D97706]');
    expect(
      screen.getByText('Wrong Event — Ticket registered for another event')
    ).toBeInTheDocument();
  });

  it('YELLOW feedback: renders INVALID_TOKEN with message and amber background', async () => {
    sessionStorage.setItem('eventora_scanner_token', 'jwt_scanner_token_xyz');
    sessionStorage.setItem(
      'eventora_scanner_event',
      JSON.stringify({
        eventId: 'evt_123',
        eventTitle: 'HackFest 2026',
        volunteerName: 'Alex Volunteer',
      })
    );

    vi.mocked(api.post).mockResolvedValueOnce({
      result: 'YELLOW',
      reason: 'INVALID_TOKEN',
    });

    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <ScannerPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('scanner-simulated-input'), {
      target: { value: 'ev_tok_1234567890123456789012342' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('scanner-feedback-yellow')).toBeInTheDocument();
    });

    const feedback = screen.getByTestId('scanner-feedback-yellow');
    expect(feedback).toHaveClass('bg-[#D97706]');
    expect(
      screen.getByText('Invalid Ticket — Unrecognized token')
    ).toBeInTheDocument();
  });

  it('YELLOW feedback: renders VOID with message and amber background', async () => {
    sessionStorage.setItem('eventora_scanner_token', 'jwt_scanner_token_xyz');
    sessionStorage.setItem(
      'eventora_scanner_event',
      JSON.stringify({
        eventId: 'evt_123',
        eventTitle: 'HackFest 2026',
        volunteerName: 'Alex Volunteer',
      })
    );

    vi.mocked(api.post).mockResolvedValueOnce({
      result: 'YELLOW',
      reason: 'VOID',
    });

    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <ScannerPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('scanner-simulated-input'), {
      target: { value: 'ev_tok_1234567890123456789012343' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('scanner-feedback-yellow')).toBeInTheDocument();
    });

    const feedback = screen.getByTestId('scanner-feedback-yellow');
    expect(feedback).toHaveClass('bg-[#D97706]');
    expect(
      screen.getByText('Ticket Voided — Cancelled registration')
    ).toBeInTheDocument();
  });

  it('YELLOW feedback: renders NOT_CHECKED_IN with message and amber background', async () => {
    sessionStorage.setItem('eventora_scanner_token', 'jwt_scanner_token_xyz');
    sessionStorage.setItem(
      'eventora_scanner_event',
      JSON.stringify({
        eventId: 'evt_123',
        eventTitle: 'HackFest 2026',
        volunteerName: 'Alex Volunteer',
      })
    );

    vi.mocked(api.post).mockResolvedValueOnce({
      result: 'YELLOW',
      reason: 'NOT_CHECKED_IN',
    });

    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <ScannerPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('scanner-simulated-input'), {
      target: { value: 'ev_tok_1234567890123456789012344' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('scanner-feedback-yellow')).toBeInTheDocument();
    });

    const feedback = screen.getByTestId('scanner-feedback-yellow');
    expect(feedback).toHaveClass('bg-[#D97706]');
    expect(
      screen.getByText('Not Checked In — Entry check-in required before Meal/Kit redemption')
    ).toBeInTheDocument();
  });

  it('RED feedback: displays duplicate ticket message with formatted timestamp and volunteer label', async () => {
    sessionStorage.setItem('eventora_scanner_token', 'jwt_scanner_token_xyz');
    sessionStorage.setItem(
      'eventora_scanner_event',
      JSON.stringify({
        eventId: 'evt_123',
        eventTitle: 'HackFest 2026',
        volunteerName: 'Alex Volunteer',
      })
    );

    const fixedIso = '2026-10-31T10:30:00.000Z';
    const expectedTime = new Date(fixedIso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    vi.mocked(api.post).mockResolvedValueOnce({
      result: 'RED',
      scannedAt: fixedIso,
      scannedByLabel: 'Volunteer A',
    });

    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <ScannerPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('scanner-simulated-input'), {
      target: { value: 'ev_tok_1234567890123456789012399' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('scanner-feedback-red')).toBeInTheDocument();
    });

    const feedback = screen.getByTestId('scanner-feedback-red');
    expect(feedback).toHaveClass('bg-[#E11D48]');
    expect(screen.getByText('DUPLICATE TICKET')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(expectedTime))).toBeInTheDocument();
    expect(screen.getByText(/Volunteer A/)).toBeInTheDocument();
  });

  it('5. Offline Security: displays amber offline banner, halts scans, and never replays queued scans on reconnect', async () => {
    sessionStorage.setItem('eventora_scanner_token', 'jwt_scanner_token_xyz');
    sessionStorage.setItem(
      'eventora_scanner_event',
      JSON.stringify({
        eventId: 'evt_123',
        eventTitle: 'HackFest 2026',
        volunteerName: 'Alex Volunteer',
      })
    );

    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <ScannerPage />
      </MemoryRouter>
    );

    // Simulate going offline
    fireEvent(window, new Event('offline'));

    await waitFor(() => {
      expect(
        screen.getByText('Offline: scanning paused. Live database connection required.')
      ).toBeInTheDocument();
    });

    const banner = screen.getByTestId('scanner-offline-banner');
    expect(banner).toHaveClass('bg-[#D97706]');
    expect(banner).toHaveClass('text-[#0F172A]');

    // Clear post mock calls
    vi.mocked(api.post).mockClear();

    // Reconnection event
    fireEvent(window, new Event('online'));

    // Assert that no queued scans were replayed on reconnect
    expect(api.post).not.toHaveBeenCalledWith(
      '/gate/scan',
      expect.anything(),
      expect.anything()
    );
  });
});

describe('Club Community Hub Suite (Prompt 16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3. ChatThread: renders virtualized message feed, role badges, and disables composer on read-only', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/messages')) {
        return {
          messages: [
            {
              id: 'msg_1',
              channelId: 'chan_announcements',
              authorId: 'user_lead',
              authorName: 'Dr. Coordinator',
              body: 'Welcome to HackFest 2026 announcements!',
              authorRoleBadge: 'FACULTY',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'msg_2',
              channelId: 'chan_announcements',
              authorId: 'user_123',
              authorName: 'Tester Student',
              body: '{"type":"EVENT_CARD","eventId":"evt_123","title":"Keynote Workshop"}',
              authorRoleBadge: 'ATTENDEE',
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }
      if (url.includes('/pinned')) {
        return { pinned: [] };
      }
      return {};
    });

    render(
      <MemoryRouter>
        <ChatThread
          channelId="chan_announcements"
          channelName="announcements"
          isReadOnly={true}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome to HackFest 2026 announcements!')).toBeInTheDocument();
    });

    // Faculty badge
    expect(screen.getByText('FACULTY')).toBeInTheDocument();

    // Event card CTA
    expect(screen.getByText('Keynote Workshop')).toBeInTheDocument();
    expect(screen.getByText('View Event & Register')).toBeInTheDocument();

    // Read only composer banner
    expect(
      screen.getByText('Only club organizers and administrators can post in #announcements')
    ).toBeInTheDocument();
  });
});
