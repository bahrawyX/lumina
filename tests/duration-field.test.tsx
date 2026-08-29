/**
 * The duration field: presets, plus a custom value alongside them.
 *
 * The bug that motivated it was that the presets were the only durations
 * available, so a 25-minute pomodoro had to be rounded to 30. The bug it
 * turned up on the way is the one worth guarding: a task whose duration was
 * NOT on the preset list rendered an empty trigger, because `<SelectValue />`
 * has nothing to display for a value with no matching `<SelectItem>` — so the
 * task read as having no duration at all.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DurationField, clampDuration, MAX_DURATION } from '@/components/tasks/DurationField';

function setup(value: number) {
  const onChange = vi.fn();
  const view = render(<DurationField value={value} onChange={onChange} />);
  return { onChange, view };
}

describe('an off-list value is visible instead of blank', () => {
  it('opens straight into the number input showing the real duration', () => {
    // 25 is not a preset. Before, this rendered an empty dropdown trigger.
    setup(25);
    const input = screen.getByLabelText('Duration in minutes') as HTMLInputElement;
    expect(input.value).toBe('25');
  });

  it('shows the dropdown for a value that IS a preset', () => {
    setup(30);
    expect(screen.queryByLabelText('Duration in minutes')).toBeNull();
    expect(screen.getByLabelText('Duration')).toBeTruthy();
  });
});

describe('typing a custom duration', () => {
  it('reports the typed value on blur', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(25);
    const input = screen.getByLabelText('Duration in minutes');
    await user.clear(input);
    await user.type(input, '50');
    await user.tab();
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it('commits on Enter without waiting for a blur', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(25);
    const input = screen.getByLabelText('Duration in minutes');
    await user.clear(input);
    await user.type(input, '17{Enter}');
    expect(onChange).toHaveBeenCalledWith(17);
  });

  it('reverts on Escape rather than committing a half-typed number', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(25);
    const input = screen.getByLabelText('Duration in minutes') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '9{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('25');
  });

  it('refuses to write a zero-minute task, reverting instead', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(25);
    const input = screen.getByLabelText('Duration in minutes') as HTMLInputElement;
    await user.clear(input);
    await user.tab();
    // An empty field is a mistake, not a request for a task of no length.
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('25');
  });

  it('clamps rather than offering a value the API would reject', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(25);
    const input = screen.getByLabelText('Duration in minutes');
    await user.clear(input);
    await user.type(input, '99999{Enter}');
    // `createTaskSchema` caps at 24 hours; the field must not be able to
    // produce a 400 from its own UI.
    expect(onChange).toHaveBeenCalledWith(MAX_DURATION);
  });
});

describe('going back to the presets', () => {
  it('snaps to the nearest preset, so the dropdown is never blank', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(50);
    await user.click(screen.getByLabelText('Back to preset durations'));
    // 50 is nearest to 45, not 60. Returning to the dropdown while still
    // holding 50 would reproduce the empty-trigger bug exactly.
    expect(onChange).toHaveBeenCalledWith(45);
  });
});

describe('clampDuration', () => {
  it('holds the bounds the server enforces', () => {
    expect(clampDuration(0)).toBe(1);
    expect(clampDuration(-5)).toBe(1);
    expect(clampDuration(99999)).toBe(1440);
    expect(clampDuration(12.6)).toBe(13);
    expect(clampDuration(45)).toBe(45);
  });
});

/**
 * The field is controlled: it leaves custom mode only once the PARENT hands
 * back a value that is on the preset list. A `vi.fn()` never does, so the
 * multi-step tests below need a real owner of the state.
 */
function Controlled({ initial, onChange }: { initial: number; onChange: (n: number) => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <DurationField
      value={value}
      onChange={(n) => {
        setValue(n);
        onChange(n);
      }}
    />
  );
}

describe('the escape flag does not poison the next edit', () => {
  it('still commits after an escape, a return to presets, and a re-entry', async () => {
    // The guard that stops Escape from committing is a ref, so it has to be
    // cleared on the way back in. Left set, the next genuine edit would be
    // silently dropped — a worse bug than the one it fixed.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={25} onChange={onChange} />);

    const input = screen.getByLabelText('Duration in minutes');
    await user.clear(input);
    await user.type(input, '9{Escape}');
    expect(onChange).not.toHaveBeenCalled();

    // 25 is nearest to 30, so the field can now render a dropdown again.
    await user.click(screen.getByLabelText('Back to preset durations'));
    expect(onChange).toHaveBeenCalledWith(30);
    expect(screen.queryByLabelText('Duration in minutes')).toBeNull();
    onChange.mockClear();

    // Re-enter custom mode through the dropdown and make a real edit.
    await user.click(screen.getByLabelText('Duration'));
    await user.click(await screen.findByText('Custom…'));
    const reopened = screen.getByLabelText('Duration in minutes');
    await user.clear(reopened);
    await user.type(reopened, '35{Enter}');
    expect(onChange).toHaveBeenCalledWith(35);
  });

  it('keeps showing the number input while the value stays off-list', async () => {
    // Typing 25 must not bounce back to a dropdown that cannot display it.
    const user = userEvent.setup();
    render(<Controlled initial={30} onChange={() => {}} />);
    await user.click(screen.getByLabelText('Duration'));
    await user.click(await screen.findByText('Custom…'));
    const input = screen.getByLabelText('Duration in minutes');
    await user.clear(input);
    await user.type(input, '25{Enter}');
    expect((screen.getByLabelText('Duration in minutes') as HTMLInputElement).value).toBe('25');
  });
});
