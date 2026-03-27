import React from 'react';
import { DailyPlanView } from '@/components/planner/DailyPlanView';
import { IntelligencePanel } from '@/components/planner/IntelligencePanel';

const DailyPlanPage: React.FC = () => {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const toggleInsights = React.useCallback(() => setPanelOpen((v) => !v), []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <DailyPlanView onToggleInsights={toggleInsights} insightsOpen={panelOpen} />
      <IntelligencePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
};

export default DailyPlanPage;
