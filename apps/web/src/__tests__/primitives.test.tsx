import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { SeatPill, getSeatThreshold } from '@/components/primitives/seat-pill';
import { StickyBottomSheet } from '@/components/primitives/sticky-bottom-sheet';
import {
  SkeletonCard,
  RealPosterCard,
  POSTER_CARD_HEIGHT_CLASSES,
} from '@/components/primitives/skeleton-card';

describe('App-Level Primitives Suite', () => {
  describe('CountdownTimer with Fake Timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('displays countdown and triggers onExpire precisely when target time is reached', () => {
      const onExpire = vi.fn();
      const expiresAt = new Date(Date.now() + 5000).toISOString();

      render(<CountdownTimer expiresAt={expiresAt} onExpire={onExpire} />);

      const timerEl = screen.getByTestId('countdown-timer');
      expect(timerEl).toBeInTheDocument();
      expect(timerEl.textContent).toBe('00:05');
      expect(onExpire).not.toHaveBeenCalled();

      // Advance by 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(timerEl.textContent).toBe('00:02');
      expect(onExpire).not.toHaveBeenCalled();

      // Advance past target time (by 3 more seconds)
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(timerEl.textContent).toBe('00:00');
      expect(onExpire).toHaveBeenCalledTimes(1);
    });
  });

  describe('SeatPill Thresholds & Colors', () => {
    it('correctly categorizes remaining seat capacity into thresholds', () => {
      expect(getSeatThreshold(50, 100)).toBe('many');
      expect(getSeatThreshold(25, 100)).toBe('many');
      expect(getSeatThreshold(20, 100)).toBe('few');
      expect(getSeatThreshold(5, 100)).toBe('few');
      expect(getSeatThreshold(0, 100)).toBe('sold-out');
      expect(getSeatThreshold(-1, 100)).toBe('sold-out');
    });

    it('renders emerald styles for many seats', () => {
      render(<SeatPill remaining={45} capacity={100} />);
      const pill = screen.getByTestId('seat-pill');
      expect(pill).toHaveAttribute('data-threshold', 'many');
      expect(pill.className).toContain('emerald');
      expect(pill.textContent).toContain('45 seats left');
    });

    it('renders amber styles for few seats', () => {
      render(<SeatPill remaining={10} capacity={100} />);
      const pill = screen.getByTestId('seat-pill');
      expect(pill).toHaveAttribute('data-threshold', 'few');
      expect(pill.className).toContain('amber');
      expect(pill.textContent).toContain('10 seats left');
    });

    it('renders rose styles and Sold Out text when remaining is zero', () => {
      render(<SeatPill remaining={0} capacity={100} />);
      const pill = screen.getByTestId('seat-pill');
      expect(pill).toHaveAttribute('data-threshold', 'sold-out');
      expect(pill.className).toContain('rose');
      expect(pill.textContent).toContain('Sold Out');
    });
  });

  describe('StickyBottomSheet Mobile Thumb-Zone', () => {
    it('enforces min-h-12 and hidden at lg desktop breakpoint', () => {
      render(
        <StickyBottomSheet>
          <button>Submit</button>
        </StickyBottomSheet>
      );
      const sheet = screen.getByTestId('sticky-bottom-sheet');
      expect(sheet.className).toContain('min-h-12');
      expect(sheet.className).toContain('lg:hidden');
      expect(sheet.className).toContain('fixed');
      expect(sheet.className).toContain('bottom-0');
    });
  });

  describe('CLS Parity: SkeletonCard and RealPosterCard', () => {
    it('skeleton and real poster card share the exact same height class set', () => {
      const { container: skeletonContainer } = render(<SkeletonCard />);
      const { container: realContainer } = render(
        <RealPosterCard title="Hackathon" category="AI" />
      );

      const skeletonCard = skeletonContainer.querySelector('[data-testid="skeleton-card"]')!;
      const realCard = realContainer.querySelector('[data-testid="real-poster-card"]')!;

      expect(skeletonCard).toBeInTheDocument();
      expect(realCard).toBeInTheDocument();

      // Check each height class in POSTER_CARD_HEIGHT_CLASSES
      const heightTokens = POSTER_CARD_HEIGHT_CLASSES.split(' ');
      for (const token of heightTokens) {
        expect(skeletonCard.className).toContain(token);
        expect(realCard.className).toContain(token);
      }
    });
  });
});
