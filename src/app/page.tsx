import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Lumina — Calendar, tasks, and focus in one place',
  description: 'Lumina is a productivity workspace that combines calendar management, task boards, daily planning, Pomodoro focus sessions, goal tracking, and AI-powered scheduling insights.',
  alternates: { canonical: '/' },
};

/**
 * The marketing page renders unconditionally, server-side.
 *
 * It used to be wrapped in a client component that awaited
 * `authClient.useSession()` before rendering anything, so the prerendered HTML
 * was a single pulsing wordmark — every crawler that doesn't execute JS saw a
 * one-word page, and LCP was gated on an auth round-trip.
 *
 * The signed-in → /calendar redirect that gate bought us now happens at the
 * edge in `src/proxy.ts`, which reads the session cookie before any HTML is
 * produced. Marketing content must never be conditional on a client fetch.
 */
export default function Page() {
  return <LandingPage />;
}
