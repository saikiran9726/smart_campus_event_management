import React from 'react';
import { render } from '@testing-library/react';
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
});
