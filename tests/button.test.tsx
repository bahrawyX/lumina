/**
 * Button component — render & variant tests.
 *
 * Locks in the Phase 3 polish: unified signature easing, active:scale-[0.98],
 * and the warm hover on the outline variant.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('<Button />', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies the default variant classes', () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/bg-primary/);
    expect(btn.className).toMatch(/text-white/);
  });

  it('applies the outline variant classes with warm hover border', () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/border-border/);
    expect(btn.className).toMatch(/hover:border-foreground\/20/);
  });

  it('applies the ghost variant without background', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/hover:bg-accent/);
    expect(btn.className).not.toMatch(/\bbg-primary\b/);
  });

  it('uses the signature easing + press-scale', () => {
    render(<Button>Press</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/ease-signature/);
    expect(btn.className).toMatch(/active:scale-\[0\.98\]/);
  });

  it('respects disabled state', () => {
    render(<Button disabled>Off</Button>);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toMatch(/disabled:opacity-50/);
  });

  it('forwards arbitrary props and className', () => {
    render(<Button className="custom-x" data-testid="b">Go</Button>);
    const btn = screen.getByTestId('b');
    expect(btn.className).toMatch(/custom-x/);
  });

  it('renders each size variant with the right height', () => {
    const { rerender } = render(<Button size="default">a</Button>);
    expect(screen.getByRole('button').className).toMatch(/h-9/);

    rerender(<Button size="sm">b</Button>);
    expect(screen.getByRole('button').className).toMatch(/h-8/);

    rerender(<Button size="lg">c</Button>);
    expect(screen.getByRole('button').className).toMatch(/h-10/);

    rerender(<Button size="icon">d</Button>);
    expect(screen.getByRole('button').className).toMatch(/h-9 w-9/);
  });
});
