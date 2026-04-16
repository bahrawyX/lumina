import type { Metadata } from 'next';
import { LandingPageWrapper } from '@/components/landing/LandingPageWrapper';

export const metadata: Metadata = {
  title: 'Lumina — Calendar, tasks, and focus in one place',
  description: 'Lumina is a productivity workspace that combines calendar management, task boards, daily planning, Pomodoro focus sessions, goal tracking, and AI-powered scheduling insights.',
  alternates: { canonical: '/' },
};

export default function Page() {
  return <LandingPageWrapper />;
}
