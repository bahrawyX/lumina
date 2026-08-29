/**
 * The manual "sync calendars now" control.
 *
 * Every piece of this existed before the button did. `triggerExternalSync()`
 * was an exported function with **zero callers**, and `useOutlookSync` has
 * listened for its `lumina:external-sync-now` event all along — the only
 * dispatchers were the sidebar's connect and disconnect handlers. So an
 * external sync could be started by connecting an account, or by the
 * ten-minute background poll, and by nothing a person could press.
 *
 * These are behavioural rather than a scan of the source, because the
 * interesting parts are conditional rendering and an event dispatch, and both
 * can simply be exercised.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarSyncButton } from '@/components/calendar/CalendarSyncButton';
import { usePlannerStore } from '@/store/usePlannerStore';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * The app mounts one `TooltipProvider` at the root (`app/providers.tsx`), so
 * the component does not carry its own. Tests have to supply it or Radix
 * throws before anything is asserted.
 */
function render(ui: React.ReactElement) {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

function setConnection(state: {
  googleConnected?: boolean;
  outlookConnected?: boolean;
  isSyncing?: boolean;
}) {
  usePlannerStore.setState({
    googleConnected: false,
    outlookConnected: false,
    isSyncing: false,
    ...state,
  });
}

let dispatched: string[] = [];
let listener: () => void;

beforeEach(() => {
  dispatched = [];
  listener = () => dispatched.push('lumina:external-sync-now');
  window.addEventListener('lumina:external-sync-now', listener);
});

afterEach(() => {
  window.removeEventListener('lumina:external-sync-now', listener);
  vi.restoreAllMocks();
});

describe('when no external calendar is connected', () => {
  it('renders nothing at all', () => {
    // Not a disabled button: a greyed control invites a click and then
    // explains nothing, and with no account there is genuinely nothing to
    // re-fetch — the local calendar is already the source of truth.
    setConnection({});
    const { container } = render(<CalendarSyncButton />);
    expect(container.firstChild).toBeNull();
  });
});

describe('when a calendar is connected', () => {
  it('appears for Google', () => {
    setConnection({ googleConnected: true });
    render(<CalendarSyncButton />);
    expect(screen.getByLabelText('Sync calendars now')).toBeTruthy();
  });

  it('appears for Outlook', () => {
    setConnection({ outlookConnected: true });
    render(<CalendarSyncButton />);
    expect(screen.getByLabelText('Sync calendars now')).toBeTruthy();
  });

  it('dispatches the event useOutlookSync is already listening for', async () => {
    // The whole point. If this regressed to a no-op the button would look
    // fine and do nothing, which is the state the calendar was already in.
    const user = userEvent.setup();
    setConnection({ googleConnected: true });
    render(<CalendarSyncButton />);

    await user.click(screen.getByLabelText('Sync calendars now'));

    expect(dispatched).toEqual(['lumina:external-sync-now']);
  });
});

describe('while a sync is in flight', () => {
  it('disables itself so a second press cannot pile on', async () => {
    const user = userEvent.setup();
    setConnection({ googleConnected: true, isSyncing: true });
    render(<CalendarSyncButton />);

    const button = screen.getByLabelText('Syncing calendars') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    await user.click(button);
    expect(dispatched).toEqual([]);
  });

  it('spins, and respects reduced motion', () => {
    setConnection({ googleConnected: true, isSyncing: true });
    const { container } = render(<CalendarSyncButton />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('animate-spin');
    // Someone who has asked the OS for less motion should not get a spinner
    // rotating indefinitely in their toolbar.
    expect(svg?.getAttribute('class')).toContain('motion-reduce:animate-none');
  });

  it('stops spinning once the sync finishes', () => {
    setConnection({ googleConnected: true, isSyncing: false });
    const { container } = render(<CalendarSyncButton />);
    expect(container.querySelector('svg')?.getAttribute('class') ?? '').not.toContain('animate-spin');
  });
});
