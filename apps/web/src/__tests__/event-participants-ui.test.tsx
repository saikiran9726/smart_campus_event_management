import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventParticipantsTab } from '../features/organizer/EventParticipantsTab';
import { api } from '../lib/api';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_org_lead',
      fullName: 'Lead Organizer',
      email: 'lead@campus.edu',
      role: 'ORGANIZER',
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: true,
    hasRole: () => true,
    signOut: vi.fn(),
  }),
}));

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('Area 3: Event Participants and Attendance UI', () => {
  let queryClient: QueryClient;

  const mockParticipantsData = {
    event: {
      id: 'ev_123',
      title: 'DevOps & Cloud Sprint',
      slug: 'devops-sprint',
      isEnded: true,
    },
    totals: {
      totalCount: 3,
      registeredCount: 3,
      attendedCount: 2,
      noShowCount: 1,
    },
    items: [
      {
        id: 'reg_1',
        registrationId: 'reg_1',
        userId: 'usr_1',
        fullName: 'Jane Developer',
        email: 'jane@campus.edu',
        rollNumber: '21CS001',
        department: 'Computer Science',
        year: 3,
        phone: '9876543210',
        registeredAt: new Date().toISOString(),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'NOT_REQUIRED',
        amountPaise: 0,
        ticketId: 'tkt_1',
        ticketStatus: 'CHECKED_IN',
        checkedInAt: new Date().toISOString(),
        checkedInVia: 'SCANNER',
        attended: true,
        isNoShow: false,
        attendanceStatus: 'Attended',
      },
      {
        id: 'reg_2',
        registrationId: 'reg_2',
        userId: 'usr_2',
        fullName: 'John Designer',
        email: 'john@campus.edu',
        rollNumber: '21IT045',
        department: 'Information Technology',
        year: 2,
        phone: '9876543211',
        registeredAt: new Date().toISOString(),
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'NOT_REQUIRED',
        amountPaise: 0,
        ticketId: 'tkt_2',
        ticketStatus: 'VALID',
        checkedInAt: null,
        checkedInVia: null,
        attended: false,
        isNoShow: true,
        attendanceStatus: 'No-show',
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
      totalPages: 1,
      totalItems: 2,
    },
  };

  beforeEach(() => {
    queryClient = createClient();
    vi.clearAllMocks();
    vi.spyOn(api, 'get').mockResolvedValue(mockParticipantsData as any);
  });

  it('renders status tabs with count badges and displays participant rows', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <EventParticipantsTab eventId="ev_123" eventSlug="devops-sprint" />
      </QueryClientProvider>
    );

    // Verify header and badge counts
    expect(await screen.findByText('Event Participants & Attendance')).toBeInTheDocument();
    const janeElements = await screen.findAllByText('Jane Developer');
    expect(janeElements.length).toBeGreaterThan(0);
    const johnElements = screen.getAllByText('John Designer');
    expect(johnElements.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Attended').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No-show').length).toBeGreaterThan(0);
  });

  it('triggers authenticated CSV blob download on button click', async () => {
    const mockBlob = new Blob(['name,email\ntest,test@test.com'], { type: 'text/csv' });
    const getBlobSpy = vi.spyOn(api, 'getBlob').mockResolvedValue(mockBlob);

    // Mock URL.createObjectURL and URL.revokeObjectURL
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
    window.URL.revokeObjectURL = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <EventParticipantsTab eventId="ev_123" eventSlug="devops-sprint" />
      </QueryClientProvider>
    );

    await screen.findAllByText('Jane Developer');

    const downloadCsvBtn = screen.getByTestId('btn-download-participants-csv');
    fireEvent.click(downloadCsvBtn);

    await waitFor(() => {
      expect(getBlobSpy).toHaveBeenCalledWith(
        expect.stringContaining('/events/ev_123/participants/export?format=csv')
      );
    });
  });

  it('triggers authenticated Excel blob download on button click', async () => {
    const mockBlob = new Blob(['fake-binary-content'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const getBlobSpy = vi.spyOn(api, 'getBlob').mockResolvedValue(mockBlob);

    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-excel-blob');
    window.URL.revokeObjectURL = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <EventParticipantsTab eventId="ev_123" eventSlug="devops-sprint" />
      </QueryClientProvider>
    );

    await screen.findAllByText('Jane Developer');

    const downloadExcelBtn = screen.getByTestId('btn-download-participants-excel');
    fireEvent.click(downloadExcelBtn);

    await waitFor(() => {
      expect(getBlobSpy).toHaveBeenCalledWith(
        expect.stringContaining('/events/ev_123/participants/export?format=xlsx')
      );
    });
  });
});
