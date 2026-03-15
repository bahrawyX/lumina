import React from 'react';
import { TaskBoard } from '@/components/tasks/TaskBoard';

const TasksPage: React.FC = () => (
  <div className="flex flex-col h-full overflow-hidden">
    <TaskBoard />
  </div>
);

export default TasksPage;
