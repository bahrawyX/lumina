import React from 'react';
import { DailyPlanView } from '@/components/planner/DailyPlanView';
import { IntelligencePanel } from '@/components/planner/IntelligencePanel';

const DailyPlanPage: React.FC = () => {
  const [panelOpen, setPanelOpen] = React.useState(false);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <div className="absolute right-3 top-2 md:right-4 md:top-3 z-10">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="h-9 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-xs font-semibold text-zinc-200 hover:bg-white/[0.08] transition-colors"
        >
          Explainability
        </button>
      </div>

      <DailyPlanView />

      <IntelligencePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
};

export default DailyPlanPage;
