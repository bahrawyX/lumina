import React from 'react';
import { DailyPlanView } from '@/components/planner/DailyPlanView';

const DailyPlanPage: React.FC = () => (
  <div className="h-full flex flex-col overflow-hidden">
    <DailyPlanView />
  </div>
);

export default DailyPlanPage;
