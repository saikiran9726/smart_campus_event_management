import { describe, it, expect } from 'vitest';
import { tokens, getContrastRatio } from '@/styles/tokens';

describe('Design Tokens & WCAG Contrast Compliance', () => {
  const tokenPairs: Array<{
    name: string;
    fg: string;
    bg: string;
    minRatio: number;
    isDarkBodyText?: boolean;
  }> = [
    // Dark mode body text pairs (must achieve >= 7:1)
    {
      name: 'Dark Mode: Body Text on Canvas (#0b0f19)',
      fg: tokens.dark.bodyText,
      bg: tokens.dark.canvas,
      minRatio: 7.0,
      isDarkBodyText: true,
    },
    {
      name: 'Dark Mode: Body Text on Surface (#131b2e)',
      fg: tokens.dark.bodyText,
      bg: tokens.dark.surface,
      minRatio: 7.0,
      isDarkBodyText: true,
    },
    // Dark mode muted text pairs (must achieve >= 4.5:1)
    {
      name: 'Dark Mode: Muted Text on Canvas (#0b0f19)',
      fg: tokens.dark.mutedText,
      bg: tokens.dark.canvas,
      minRatio: 4.5,
    },
    {
      name: 'Dark Mode: Muted Text on Surface (#131b2e)',
      fg: tokens.dark.mutedText,
      bg: tokens.dark.surface,
      minRatio: 4.5,
    },
    // Light mode text pairs (must achieve >= 4.5:1, body achieves >= 7:1)
    {
      name: 'Light Mode: Body Text on Canvas (#f8fafc)',
      fg: tokens.light.bodyText,
      bg: tokens.light.canvas,
      minRatio: 7.0,
    },
    {
      name: 'Light Mode: Body Text on Surface (#ffffff)',
      fg: tokens.light.bodyText,
      bg: tokens.light.surface,
      minRatio: 7.0,
    },
    {
      name: 'Light Mode: Muted Text on Canvas (#f8fafc)',
      fg: tokens.light.mutedText,
      bg: tokens.light.canvas,
      minRatio: 4.5,
    },
    {
      name: 'Light Mode: Muted Text on Surface (#ffffff)',
      fg: tokens.light.mutedText,
      bg: tokens.light.surface,
      minRatio: 4.5,
    },
    // Interactive tokens (must achieve >= 4.5:1)
    {
      name: 'Primary Button: White on Brand Indigo (#4338CA)',
      fg: '#ffffff',
      bg: tokens.brand.indigo,
      minRatio: 4.5,
    },
    {
      name: 'Destructive Button: White on Status Rose (#E11D48)',
      fg: '#ffffff',
      bg: tokens.brand.rose,
      minRatio: 4.5,
    },
    {
      name: 'Valid/Checked-In Status: Emerald on Dark Canvas (#0b0f19)',
      fg: tokens.brand.emerald,
      bg: tokens.dark.canvas,
      minRatio: 4.5,
    },
  ];

  it.each(tokenPairs)(
    '$name satisfies WCAG ratio >= $minRatio:1',
    ({ fg, bg, minRatio, isDarkBodyText }) => {
      const ratio = getContrastRatio(fg, bg);

      if (isDarkBodyText) {
        // Strict prompt requirement: fail the test below 7:1 for body text in dark mode
        expect(
          ratio,
          `Body text in dark mode must meet or exceed 7:1 contrast ratio, got ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(7.0);
      } else {
        // Prompt requirement: fail below 4.5:1 for everything else
        expect(
          ratio,
          `Token pair must meet or exceed 4.5:1 contrast ratio, got ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(minRatio);
      }
    }
  );
});
