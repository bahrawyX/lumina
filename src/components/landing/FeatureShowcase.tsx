'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const FEATURES = [
  {
    title: 'Calendar',
    description: 'Month, week, and day views with drag-and-drop event management and recurring events.',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    span: 'md:col-span-2', // wide card
  },
  {
    title: 'Task Board',
    description: 'Kanban columns with subtasks, filters, search, and list view.',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/>
      </svg>
    ),
    span: '',
  },
  {
    title: 'Daily Planner',
    description: 'Drag tasks into time slots. See your day at a glance.',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="10"/>
      </svg>
    ),
    span: '',
  },
  {
    title: 'Focus Sessions',
    description: 'Pomodoro timer, stopwatch, ambient sounds, mood tracking, and streak gamification.',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    span: '',
  },
  {
    title: 'Goals & OKRs',
    description: 'Set measurable targets with progress tracking and automatic task completion sync.',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
      </svg>
    ),
    span: '',
  },
  {
    title: 'Documents',
    description: 'Notion-style block editor with task embeds, multi-column layouts, and AI writing.',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
      </svg>
    ),
    span: 'md:col-span-2', // wide card
  },
];

export function FeatureShowcase() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section ref={ref} id="features" className="py-16 md:py-24 px-4 md:px-6" aria-label="Features">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 md:mb-16">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">
            Everything you need
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em]">
            Six views. One workspace.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className={`card-lift rounded-2xl border border-border bg-card p-6 md:p-8 shadow-card ${feature.span}`}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                {feature.icon}
              </div>
              <h3 className="font-display text-lg font-medium text-foreground tracking-[-0.02em] mb-1.5">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
