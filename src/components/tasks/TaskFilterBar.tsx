'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import type { TaskPriority, TaskDifficulty } from '@/types/task';
import type { DueDateFilter } from '@/store/useTaskBoardStore';
import { hasActiveFilters } from '@/utils/taskFilters';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { MobileBottomSheet } from '@/components/ui/MobileBottomSheet';
import { CheckIcon } from '@/components/icons/CheckIcons';

// ── Icons ───────────────────────────────────────────────────────────────────

const SearchIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const XIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronDown: React.FC = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const FilterIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

// ── Config ──────────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; dot: string }[] = [
  { value: 'high', label: 'High', dot: 'bg-destructive' },
  { value: 'medium', label: 'Medium', dot: 'bg-amber-500' },
  { value: 'low', label: 'Low', dot: 'bg-muted-foreground' },
];

const DIFFICULTY_OPTIONS: { value: TaskDifficulty; label: string; dot: string }[] = [
  { value: 'hard', label: 'Hard', dot: 'bg-destructive' },
  { value: 'medium', label: 'Medium', dot: 'bg-amber-500' },
  { value: 'easy', label: 'Easy', dot: 'bg-emerald-500' },
];

const DUE_DATE_OPTIONS: { value: DueDateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'this_week', label: 'Due this week' },
  { value: 'next_week', label: 'Due next week' },
  { value: 'no_date', label: 'No due date' },
  { value: 'has_date', label: 'Has due date' },
];

// ── Checkbox (inline, matches TaskListView pattern) ─────────────────────────

const Checkbox: React.FC<{ checked: boolean; onChange: () => void; label: string; dot?: string }> = ({ checked, onChange, label, dot }) => (
  <button
    type="button"
    onClick={onChange}
    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left"
  >
    <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
      checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
    }`}>
      {checked && <CheckIcon size={10} strokeWidth={3} />}
    </span>
    {dot && <span className={`flex-shrink-0 w-2 h-2 rounded-full ${dot}`} />}
    <span className="flex-1 text-xs text-foreground">{label}</span>
  </button>
);

// ── Main ────────────────────────────────────────────────────────────────────

export const TaskFilterBar: React.FC = () => {
  const searchQuery = useTaskBoardStore(s => s.searchQuery);
  const priorityFilter = useTaskBoardStore(s => s.priorityFilter);
  const difficultyFilter = useTaskBoardStore(s => s.difficultyFilter);
  const dueDateFilter = useTaskBoardStore(s => s.dueDateFilter);
  const setSearchQuery = useTaskBoardStore(s => s.setSearchQuery);
  const setPriorityFilter = useTaskBoardStore(s => s.setPriorityFilter);
  const setDifficultyFilter = useTaskBoardStore(s => s.setDifficultyFilter);
  const setDueDateFilter = useTaskBoardStore(s => s.setDueDateFilter);
  const clearAllFilters = useTaskBoardStore(s => s.clearAllFilters);

  // Local state for debounced search input
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search updates to the store
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (localSearch !== searchQuery) setSearchQuery(localSearch);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [localSearch, searchQuery, setSearchQuery]);

  // Keep local in sync if store changes externally (e.g. clear all)
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const anyActive = hasActiveFilters(searchQuery, priorityFilter, difficultyFilter, dueDateFilter);

  const togglePriority = (p: TaskPriority) => {
    setPriorityFilter(priorityFilter.includes(p) ? priorityFilter.filter(x => x !== p) : [...priorityFilter, p]);
  };
  const toggleDifficulty = (d: TaskDifficulty) => {
    setDifficultyFilter(difficultyFilter.includes(d) ? difficultyFilter.filter(x => x !== d) : [...difficultyFilter, d]);
  };

  const priorityActive = priorityFilter.length > 0;
  const difficultyActive = difficultyFilter.length > 0;
  const dueDateActive = dueDateFilter !== 'all';

  return (
    <>
    <div className="flex items-center gap-2 mb-3 flex-shrink-0 flex-wrap">
      {/* Search input */}
      <div className="relative flex-1 max-w-sm min-w-[160px]">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          <SearchIcon />
        </div>
        <input
          type="text"
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          placeholder="Search tasks..."
          aria-label="Search tasks"
          className="w-full h-8 pl-8 pr-7 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {localSearch && (
          <button
            type="button"
            onClick={() => setLocalSearch('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
          >
            <XIcon size={12} />
          </button>
        )}
      </div>

      {/* Priority filter */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Filter by priority"
            className={`hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
              priorityActive
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Priority
            {priorityActive && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                {priorityFilter.length}
              </span>
            )}
            <ChevronDown />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <button
              type="button"
              onClick={() => setPriorityFilter(['high', 'medium', 'low'])}
              className="hover:text-foreground transition-colors"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setPriorityFilter([])}
              className="hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="border-t border-border/50 my-1" />
          {PRIORITY_OPTIONS.map(opt => (
            <Checkbox
              key={opt.value}
              checked={priorityFilter.includes(opt.value)}
              onChange={() => togglePriority(opt.value)}
              label={opt.label}
              dot={opt.dot}
            />
          ))}
        </PopoverContent>
      </Popover>

      {/* Difficulty filter */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Filter by difficulty"
            className={`hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
              difficultyActive
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Difficulty
            {difficultyActive && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                {difficultyFilter.length}
              </span>
            )}
            <ChevronDown />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <button
              type="button"
              onClick={() => setDifficultyFilter(['hard', 'medium', 'easy'])}
              className="hover:text-foreground transition-colors"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setDifficultyFilter([])}
              className="hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="border-t border-border/50 my-1" />
          {DIFFICULTY_OPTIONS.map(opt => (
            <Checkbox
              key={opt.value}
              checked={difficultyFilter.includes(opt.value)}
              onChange={() => toggleDifficulty(opt.value)}
              label={opt.label}
              dot={opt.dot}
            />
          ))}
        </PopoverContent>
      </Popover>

      {/* Due date filter */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Filter by due date"
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
              dueDateActive
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {dueDateActive ? DUE_DATE_OPTIONS.find(o => o.value === dueDateFilter)?.label : 'Due date'}
            <ChevronDown />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1">
          {DUE_DATE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDueDateFilter(opt.value)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors ${
                dueDateFilter === opt.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <span className="flex-1 text-left">{opt.label}</span>
              {dueDateFilter === opt.value && <CheckIcon size={10} strokeWidth={3} />}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Mobile: single Filter button opens bottom sheet */}
      <button
        type="button"
        onClick={() => setMobileSheetOpen(true)}
        aria-label="Open filters"
        className={`md:hidden inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
          (priorityActive || difficultyActive || dueDateActive)
            ? 'bg-primary/10 border-primary/40 text-primary'
            : 'bg-card border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        <FilterIcon />
        Filters
        {(priorityActive || difficultyActive || dueDateActive) && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
            {(priorityActive ? 1 : 0) + (difficultyActive ? 1 : 0) + (dueDateActive ? 1 : 0)}
          </span>
        )}
      </button>

      {/* Clear filters */}
      {anyActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Clear all filters"
        >
          Clear
        </Button>
      )}
    </div>

    {/* Mobile filter bottom sheet */}
    <MobileBottomSheet
      open={mobileSheetOpen}
      onClose={() => setMobileSheetOpen(false)}
      title="Filters"
    >
      <div className="space-y-5 pb-4">
        {/* Priority */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Priority</h4>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              <button type="button" onClick={() => setPriorityFilter(['high', 'medium', 'low'])} className="hover:text-foreground transition-colors">
                Select all
              </button>
              <button type="button" onClick={() => setPriorityFilter([])} className="hover:text-foreground transition-colors">
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-0.5">
            {PRIORITY_OPTIONS.map(opt => (
              <Checkbox
                key={opt.value}
                checked={priorityFilter.includes(opt.value)}
                onChange={() => togglePriority(opt.value)}
                label={opt.label}
                dot={opt.dot}
              />
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Difficulty</h4>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              <button type="button" onClick={() => setDifficultyFilter(['hard', 'medium', 'easy'])} className="hover:text-foreground transition-colors">
                Select all
              </button>
              <button type="button" onClick={() => setDifficultyFilter([])} className="hover:text-foreground transition-colors">
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-0.5">
            {DIFFICULTY_OPTIONS.map(opt => (
              <Checkbox
                key={opt.value}
                checked={difficultyFilter.includes(opt.value)}
                onChange={() => toggleDifficulty(opt.value)}
                label={opt.label}
                dot={opt.dot}
              />
            ))}
          </div>
        </div>

        {/* Due date */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Due date</h4>
          <div className="space-y-0.5">
            {DUE_DATE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDueDateFilter(opt.value)}
                className={`flex items-center w-full px-2 py-2 rounded-md text-xs transition-colors ${
                  dueDateFilter === opt.value ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <span className="flex-1 text-left">{opt.label}</span>
                {dueDateFilter === opt.value && <CheckIcon size={10} strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          {anyActive && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="flex-1">
              Clear all
            </Button>
          )}
          <Button size="sm" onClick={() => setMobileSheetOpen(false)} className="flex-1">
            Done
          </Button>
        </div>
      </div>
    </MobileBottomSheet>
    </>
  );
};
