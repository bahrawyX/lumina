'use client';

import { CursorZone } from './CursorZone';
import { Reveal } from './animations/Reveal';

const INSIGHTS = [
  { label: 'Focus windows', desc: 'Finds the best time slots for deep work based on your calendar.' },
  { label: 'Daily brief', desc: 'A Gemini-powered morning summary of your day — events, tasks, and priorities.' },
  { label: 'Schedule analysis', desc: 'Detects meeting overload, fragmented time, and scheduling conflicts.' },
];

export function AIInsightsSection() {
  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-muted/30" aria-label="AI insights">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-10 max-w-3xl">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">
              Intelligence
            </p>
            <h2 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em]">
              An engine that learns your rhythm.
            </h2>
            <p className="text-sm text-muted-foreground mt-3 italic max-w-lg">
              Lumina looks at your calendar and tells you when to do deep work. No chatbot. No prompt engineering.
            </p>
          </div>
        </div>

        <CursorZone label="Thinking" color="#8b5cf6">
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            {INSIGHTS.map((item, i) => (
              <Reveal
                key={item.label}
                className="card-lift rounded-xl border border-border bg-card p-5 shadow-card"
                y={16}
                duration={0.5}
                delay={0.15 + i * 0.1}
              >
                <h3 className="font-display text-sm font-medium text-foreground tracking-[-0.02em] mb-1.5">
                  {item.label}
                </h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </CursorZone>
      </div>
    </section>
  );
}
