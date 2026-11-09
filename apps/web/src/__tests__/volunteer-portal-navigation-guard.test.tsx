import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthContext, RequireVolunteer } from '@/lib/auth';

let mockAuthValue: any = {};

function renderShell(initialPath = '/') {
  return render(
    <AuthContext.Provider value={mockAuthValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

function renderGuardedRoute(initialPath = '/volunteer') {
  return render(
    <AuthContext.Provider value={mockAuthValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
          <Route
            path="/volunteer"
            element={
              <RequireVolunteer>
                <div data-testid="volunteer-dashboard">Volunteer Dashboard</div>
              </RequireVolunteer>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Volunteer Portal Visibility, Navigation & Route Protection Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Navigation Visibility Rules', () => {
    it('hides Volunteer from main nav and mobile nav for normal student without volunteer duty', () => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: {
          id: 'u_student_1',
          fullName: 'Normal Student',
          email: 'student@campus.edu',
          role: 'STUDENT',
          volunteer: { isVolunteer: false, hasPendingInvite: false, activeCount: 0 },
        },
        isAdmin: false,
        isFaculty: false,
        isClubOrganizer: false,
        signOut: vi.fn(),
      };

      renderShell('/');
      const mobileNav = screen.getByLabelText('Mobile Navigation');
      expect(within(mobileNav).queryByText('Volunteer')).not.toBeInTheDocument();
    });

    it('hides Volunteer for admin who has no volunteer duty', () => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: {
          id: 'u_admin_1',
          fullName: 'Campus Admin',
          email: 'admin@campus.edu',
          role: 'ADMIN',
          volunteer: { isVolunteer: false, hasPendingInvite: false, activeCount: 0 },
        },
        isAdmin: true,
        isFaculty: true,
        isClubOrganizer: true,
        signOut: vi.fn(),
      };

      renderShell('/');
      const mobileNav = screen.getByLabelText('Mobile Navigation');
      expect(within(mobileNav).queryByText('Volunteer')).not.toBeInTheDocument();
      expect(within(mobileNav).getByText('Admin')).toBeInTheDocument();
    });

    it('renders Volunteer for assigned volunteer student and places it before Profile in mobile nav', () => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: {
          id: 'u_vol_1',
          fullName: 'Assigned Volunteer',
          email: 'volunteer@campus.edu',
          role: 'STUDENT',
          volunteer: { isVolunteer: true, hasPendingInvite: false, activeCount: 1 },
        },
        isAdmin: false,
        isFaculty: false,
        isClubOrganizer: false,
        signOut: vi.fn(),
      };

      renderShell('/');
      const mobileNav = screen.getByLabelText('Mobile Navigation');
      expect(within(mobileNav).getByText('Volunteer')).toBeInTheDocument();

      // Check order: Volunteer must appear before Profile
      const links = within(mobileNav).getAllByRole('link');
      const linkLabels = links.map((l) => l.textContent?.trim());
      const volIndex = linkLabels.findIndex((l) => l?.includes('Volunteer'));
      const profileIndex = linkLabels.findIndex((l) => l?.includes('Profile'));

      expect(volIndex).toBeGreaterThan(-1);
      expect(profileIndex).toBeGreaterThan(-1);
      expect(volIndex).toBeLessThan(profileIndex);
    });

    it('renders Volunteer for user with pending invite', () => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: {
          id: 'u_invitee_1',
          fullName: 'Invited Student',
          email: 'invitee@campus.edu',
          role: 'STUDENT',
          volunteer: { isVolunteer: false, hasPendingInvite: true, activeCount: 0 },
        },
        isAdmin: false,
        isFaculty: false,
        isClubOrganizer: false,
        signOut: vi.fn(),
      };

      renderShell('/');
      const mobileNav = screen.getByLabelText('Mobile Navigation');
      expect(within(mobileNav).getByText('Volunteer')).toBeInTheDocument();
    });
  });

  describe('2. RequireVolunteer Route Guard', () => {
    it('redirects unauthorized student to /', () => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: {
          id: 'u_student_1',
          role: 'STUDENT',
          volunteer: { isVolunteer: false, hasPendingInvite: false, activeCount: 0 },
        },
      };

      renderGuardedRoute('/volunteer');

      expect(screen.queryByTestId('volunteer-dashboard')).not.toBeInTheDocument();
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });

    it('allows eligible volunteer to view volunteer dashboard', () => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: {
          id: 'u_vol_1',
          role: 'STUDENT',
          volunteer: { isVolunteer: true, hasPendingInvite: false, activeCount: 1 },
        },
      };

      renderGuardedRoute('/volunteer');

      expect(screen.getByTestId('volunteer-dashboard')).toBeInTheDocument();
    });

    it('allows access if invitation code query param is present (?code=VOL-12345)', () => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: {
          id: 'u_new_user',
          role: 'STUDENT',
          volunteer: { isVolunteer: false, hasPendingInvite: false, activeCount: 0 },
        },
      };

      renderGuardedRoute('/volunteer?code=VOL-12345');

      expect(screen.getByTestId('volunteer-dashboard')).toBeInTheDocument();
    });
  });
});
