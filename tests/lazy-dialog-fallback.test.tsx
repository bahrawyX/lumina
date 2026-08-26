/**
 * P3-9 — every `Suspense` around a lazy dialog used `fallback={null}`.
 *
 * On a fast connection that is invisible and fine. On a slow one, clicking
 * "New goal" or "Edit task" does nothing at all until the chunk arrives, so the
 * user clicks again — and a post-deploy chunk 404 leaves them staring at a page
 * that has silently refused.
 *
 * Rendered rather than grepped, because the whole point of this component is
 * WHEN it appears: too eager and every cached open flashes a spinner for one
 * frame, which is worse than nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LazyDialogFallback } from '@/components/ui/LazyDialogFallback';

afterEach(() => {
  vi.useRealTimers();
});

describe('<LazyDialogFallback />', () => {
  it('renders nothing for the first 150ms', () => {
    vi.useFakeTimers();
    render(<LazyDialogFallback />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears once the load is slow enough to feel broken', () => {
    vi.useFakeTimers();
    render(<LazyDialogFallback />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('announces what is loading', () => {
    // The previous `fallback={null}` left a screen reader with the same silence
    // a sighted user got.
    vi.useFakeTimers();
    render(<LazyDialogFallback label="Opening task editor" />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('Opening task editor');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Opening task editor');
  });

  it('clears its timer on unmount', () => {
    // The chunk usually arrives first, which unmounts this before the timer
    // fires; a leaked timer would set state on a dead component.
    vi.useFakeTimers();
    const { unmount } = render(<LazyDialogFallback />);
    unmount();
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(1000);
      }),
    ).not.toThrow();
  });

  it('hides the spinner glyph from assistive tech', () => {
    vi.useFakeTimers();
    const { container } = render(<LazyDialogFallback />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const spinner = container.querySelector('.animate-spin');
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
  });
});
