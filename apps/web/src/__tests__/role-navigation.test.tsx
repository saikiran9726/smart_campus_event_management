import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { ThemeProvider } from '@/components/theme-provider';

// Mock auth module
let mockAuthValue: any = {};
vi.mock('@/lib/auth', () => ({
  useAuth: () => mockAuthValue,
}));

function renderShell(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('Prompt 26A: Role-Based Navigation Suite (Header, Avatar Dropdown, Mobile Nav & Sheet)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Student Role (no club ownership)', () => {
    beforeEach(() => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'u_student', fullName: 'Alice Student', email: 'alice@campus.edu', role: 'STUDENT' },
        clerkUser: { fullName: 'Alice Student', imageUrl: 'https://example.com/avatar.png' },
        isAdmin: false,
        isFaculty: false,
        isClubOrganizer: false,
        signOut: vi.fn(),
      };
    });

    it('renders Discover, Passport, Community in Header; hides Organizer, Faculty, Admin', () => {
      renderShell('/');
      const mainNav = screen.getByLabelText('Main Navigation');

      expect(within(mainNav).getByText('Discover')).toBeInTheDocument();
      expect(within(mainNav).getByText('Passport')).toBeInTheDocument();
      expect(within(mainNav).getByText('Community')).toBeInTheDocument();

      expect(within(mainNav).queryByText('Organizer Studio')).not.toBeInTheDocument();
      expect(within(mainNav).queryByText('Faculty Dashboard')).not.toBeInTheDocument();
      expect(within(mainNav).queryByText('Admin Console')).not.toBeInTheDocument();
    });

    it('renders Discover, Passport, Community, Profile in Mobile Nav; hides role links', () => {
      renderShell('/');
      const mobileNav = screen.getByLabelText('Mobile Navigation');

      expect(within(mobileNav).getByText('Discover')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Passport')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Community')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Profile')).toBeInTheDocument();

      expect(within(mobileNav).queryByText('Organizer')).not.toBeInTheDocument();
      expect(within(mobileNav).queryByText('Faculty')).not.toBeInTheDocument();
      expect(within(mobileNav).queryByText('Admin')).not.toBeInTheDocument();
    });

    it('avatar dropdown contains Profile, Passport, Sign Out; hides privileged links', async () => {
      renderShell('/');
      const avatarBtn = screen.getByLabelText('User Account Menu');
      fireEvent.pointerDown(avatarBtn);
      fireEvent.keyDown(avatarBtn, { key: 'Enter', code: 'Enter' });

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('Profile & Settings')).toBeInTheDocument();
      expect(within(menu).getByText('Event Passport')).toBeInTheDocument();
      expect(within(menu).getByText('Sign Out')).toBeInTheDocument();

      expect(within(menu).queryByText('Organizer Studio')).not.toBeInTheDocument();
      expect(within(menu).queryByText('Faculty Dashboard')).not.toBeInTheDocument();
      expect(within(menu).queryByText('Admin Console')).not.toBeInTheDocument();
    });
  });

  describe('2. Student Role with Club Ownership (OWNER/ADMIN via GET /clubs/me)', () => {
    beforeEach(() => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'u_student_clubowner', fullName: 'Bob Student Owner', email: 'bob@campus.edu', role: 'STUDENT' },
        clerkUser: { fullName: 'Bob Student Owner', imageUrl: 'https://example.com/avatar.png' },
        isAdmin: false,
        isFaculty: false,
        isClubOrganizer: true, // evaluated true from /clubs/me
        signOut: vi.fn(),
      };
    });

    it('renders Organizer Studio link in Header and Avatar Dropdown; hides Faculty and Admin', async () => {
      renderShell('/organizer');
      const mainNav = screen.getByLabelText('Main Navigation');

      expect(within(mainNav).getByText('Organizer Studio')).toBeInTheDocument();
      expect(within(mainNav).queryByText('Faculty Dashboard')).not.toBeInTheDocument();
      expect(within(mainNav).queryByText('Admin Console')).not.toBeInTheDocument();

      // Check mobile
      const mobileNav = screen.getByLabelText('Mobile Navigation');
      expect(within(mobileNav).getByText('Organizer')).toBeInTheDocument();
      expect(within(mobileNav).queryByText('Faculty')).not.toBeInTheDocument();
      expect(within(mobileNav).queryByText('Admin')).not.toBeInTheDocument();

      // Check dropdown
      const avatarBtn = screen.getByLabelText('User Account Menu');
      fireEvent.pointerDown(avatarBtn);
      fireEvent.keyDown(avatarBtn, { key: 'Enter', code: 'Enter' });

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('Organizer Studio')).toBeInTheDocument();
      expect(within(menu).queryByText('Faculty Dashboard')).not.toBeInTheDocument();
      expect(within(menu).queryByText('Admin Console')).not.toBeInTheDocument();
    });
  });

  describe('3. Organizer Role', () => {
    beforeEach(() => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'u_org', fullName: 'Charlie Organizer', email: 'charlie@campus.edu', role: 'ORGANIZER' },
        clerkUser: { fullName: 'Charlie Organizer', imageUrl: 'https://example.com/avatar.png' },
        isAdmin: false,
        isFaculty: false,
        isClubOrganizer: true,
        signOut: vi.fn(),
      };
    });

    it('renders Organizer Studio; hides Faculty and Admin', async () => {
      renderShell('/');
      const mainNav = screen.getByLabelText('Main Navigation');

      expect(within(mainNav).getByText('Organizer Studio')).toBeInTheDocument();
      expect(within(mainNav).queryByText('Faculty Dashboard')).not.toBeInTheDocument();
      expect(within(mainNav).queryByText('Admin Console')).not.toBeInTheDocument();

      const mobileNav = screen.getByLabelText('Mobile Navigation');
      expect(within(mobileNav).getByText('Organizer')).toBeInTheDocument();
      expect(within(mobileNav).queryByText('Faculty')).not.toBeInTheDocument();
      expect(within(mobileNav).queryByText('Admin')).not.toBeInTheDocument();
    });
  });

  describe('4. Faculty Role', () => {
    beforeEach(() => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'u_fac', fullName: 'Dr. Dave Faculty', email: 'dave@campus.edu', role: 'FACULTY' },
        clerkUser: { fullName: 'Dr. Dave Faculty', imageUrl: 'https://example.com/avatar.png' },
        isAdmin: false,
        isFaculty: true,
        isClubOrganizer: false,
        signOut: vi.fn(),
      };
    });

    it('renders Faculty Dashboard in Header, Mobile, and Dropdown; hides Organizer and Admin', async () => {
      renderShell('/faculty/dashboard');
      const mainNav = screen.getByLabelText('Main Navigation');

      expect(within(mainNav).getByText('Faculty Dashboard')).toBeInTheDocument();
      expect(within(mainNav).queryByText('Organizer Studio')).not.toBeInTheDocument();
      expect(within(mainNav).queryByText('Admin Console')).not.toBeInTheDocument();

      const mobileNav = screen.getByLabelText('Mobile Navigation');
      expect(within(mobileNav).getByText('Faculty')).toBeInTheDocument();
      expect(within(mobileNav).queryByText('Organizer')).not.toBeInTheDocument();
      expect(within(mobileNav).queryByText('Admin')).not.toBeInTheDocument();

      const avatarBtn = screen.getByLabelText('User Account Menu');
      fireEvent.pointerDown(avatarBtn);
      fireEvent.keyDown(avatarBtn, { key: 'Enter', code: 'Enter' });

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('Faculty Dashboard')).toBeInTheDocument();
      expect(within(menu).queryByText('Organizer Studio')).not.toBeInTheDocument();
      expect(within(menu).queryByText('Admin Console')).not.toBeInTheDocument();
    });
  });

  describe('5. Admin Role', () => {
    beforeEach(() => {
      mockAuthValue = {
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'u_adm', fullName: 'Eva Admin', email: 'eva@campus.edu', role: 'ADMIN' },
        clerkUser: { fullName: 'Eva Admin', imageUrl: 'https://example.com/avatar.png' },
        isAdmin: true,
        isFaculty: true,
        isClubOrganizer: true,
        signOut: vi.fn(),
      };
    });

    it('renders ALL links in Header, Mobile nav, and Dropdown with zero omissions', async () => {
      renderShell('/admin');
      const mainNav = screen.getByLabelText('Main Navigation');

      expect(within(mainNav).getByText('Discover')).toBeInTheDocument();
      expect(within(mainNav).getByText('Passport')).toBeInTheDocument();
      expect(within(mainNav).getByText('Community')).toBeInTheDocument();
      expect(within(mainNav).getByText('Organizer Studio')).toBeInTheDocument();
      expect(within(mainNav).getByText('Faculty Dashboard')).toBeInTheDocument();
      expect(within(mainNav).getByText('Admin Console')).toBeInTheDocument();

      const mobileNav = screen.getByLabelText('Mobile Navigation');
      expect(within(mobileNav).getByText('Discover')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Passport')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Community')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Organizer')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Faculty')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Admin')).toBeInTheDocument();
      expect(within(mobileNav).getByText('Profile')).toBeInTheDocument();

      const avatarBtn = screen.getByLabelText('User Account Menu');
      fireEvent.pointerDown(avatarBtn);
      fireEvent.keyDown(avatarBtn, { key: 'Enter', code: 'Enter' });

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('Profile & Settings')).toBeInTheDocument();
      expect(within(menu).getByText('Event Passport')).toBeInTheDocument();
      expect(within(menu).getByText('Organizer Studio')).toBeInTheDocument();
      expect(within(menu).getByText('Faculty Dashboard')).toBeInTheDocument();
      expect(within(menu).getByText('Admin Console')).toBeInTheDocument();
      expect(within(menu).getByText('Sign Out')).toBeInTheDocument();
    });

    it('highlights active route correctly', () => {
      renderShell('/faculty/dashboard');
      const activeHeaderLink = screen.getByRole('link', { name: /faculty dashboard/i });
      expect(activeHeaderLink).toHaveClass('bg-primary/10');
      expect(activeHeaderLink).toHaveClass('text-primary');
    });
  });
});
