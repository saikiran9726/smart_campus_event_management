import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import { AppShell } from '@/components/layout/app-shell';
import { ThemeProvider } from '@/components/theme-provider';

// Mock Auth module for AppShell rendering
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'usr_test_123',
      fullName: 'Alex Student',
      email: 'alex@campus.edu',
      role: 'ORGANIZER',
    },
    clerkUser: {
      fullName: 'Alex Student',
      imageUrl: 'https://example.com/avatar.png',
      primaryEmailAddress: { emailAddress: 'alex@campus.edu' },
    },
    isAdmin: false,
    isFaculty: false,
    isClubOrganizer: true,
    hasRole: (roles: string | string[]) => true,
    signOut: vi.fn(),
  }),
}));

describe('AppShell Accessibility & Structure', () => {
  it('renders skip to main content link with correct target', () => {
    const { getByText } = render(
      <MemoryRouter>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </MemoryRouter>
    );

    const skipLink = getByText('Skip to main content');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('passes automated axe-core accessibility audit with 0 violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </MemoryRouter>
    );

    // Run axe accessibility audit (in JSDOM color-contrast is tested in tokens-contrast.test.ts)
    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });

    if (results.violations.length > 0) {
      console.error(
        'Axe violations:',
        results.violations.map((v) => ({
          id: v.id,
          help: v.help,
          nodes: v.nodes.map((n) => n.html),
        }))
      );
    }

    expect(results.violations).toEqual([]);
  });

  describe('Theme Toggle Interaction & Accessibility Suite', () => {
    it('toggles theme from light to dark and updates document root class and aria-label', async () => {
      localStorage.clear();
      document.documentElement.className = '';

      const { findByRole } = render(
        <MemoryRouter initialEntries={['/']}>
          <ThemeProvider defaultTheme="light">
            <AppShell />
          </ThemeProvider>
        </MemoryRouter>
      );

      const toggleBtn = await findByRole('button', { name: /switch to dark mode/i });
      expect(toggleBtn).toBeInTheDocument();
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      fireEvent.click(toggleBtn);

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to light mode');
    });

    it('toggles theme from dark to light and updates document root class and aria-label', async () => {
      localStorage.clear();
      document.documentElement.className = '';

      const { findByRole } = render(
        <MemoryRouter initialEntries={['/']}>
          <ThemeProvider defaultTheme="dark">
            <AppShell />
          </ThemeProvider>
        </MemoryRouter>
      );

      const toggleBtn = await findByRole('button', { name: /switch to light mode/i });
      expect(toggleBtn).toBeInTheDocument();
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      fireEvent.click(toggleBtn);

      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to dark mode');
    });

    it('renders theme toggle control in navigation header across viewport layouts', async () => {
      const { findByRole } = render(
        <MemoryRouter initialEntries={['/']}>
          <ThemeProvider defaultTheme="light">
            <AppShell />
          </ThemeProvider>
        </MemoryRouter>
      );

      const toggleBtn = await findByRole('button', { name: /switch to dark mode/i });
      expect(toggleBtn).toBeInTheDocument();
      expect(toggleBtn.className).not.toContain('hidden');
    });
  });
});
