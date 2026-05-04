'use client';

import React, { useEffect, useState } from 'react';
import { MobileBottomSheet } from '@/components/ui/MobileBottomSheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGoalsStore } from '@/store/useGoalsStore';
import type { Goal, GoalColor, GoalTimeframe, TargetType } from '@/types/goal';
import { GOAL_COLORS, GOAL_COLOR_MAP, TIMEFRAME_LABELS } from '@/types/goal';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear, format,
} from 'date-fns';

// ── Emoji presets ───────────────────────────────────────────────────────────

const EMOJI_PRESETS = ['🎯', '🚀', '📈', '💪', '📚', '🏃', '✍️', '🎨', '🧠', '💰', '🏆', '⭐', '🔥', '🌱', '📝', '🎓', '🛠️', '❤️', '🌍', '🎵'];

// ── Types ───────────────────────────────────────────────────────────────────

interface TargetInput {
  tempId: string;
  title: string;
  type: TargetType;
  targetValue: number;
  unit: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export const GoalDialog: React.FC<{
  open: boolean;
  goal?: Goal | null;
  onClose: () => void;
  /** Optional — fired after a NEW goal is created so the parent can show
   *  the AI suggestion card. Receives the just-created (optimistic) goal. */
  onCreated?: (goalId: string) => void;
}> = ({ open, goal, onClose, onCreated }) => {
  const addGoal = useGoalsStore(s => s.addGoal);
  const updateGoal = useGoalsStore(s => s.updateGoal);
  const isEdit = Boolean(goal);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [color, setColor] = useState<GoalColor>('blue');
  const [timeframe, setTimeframe] = useState<GoalTimeframe>('quarterly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targets, setTargets] = useState<TargetInput[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? '');
      setEmoji(goal.emoji ?? '🎯');
      setColor((goal.color as GoalColor) ?? 'blue');
      setTimeframe(goal.timeframe);
      setStartDate(goal.startDate);
      setEndDate(goal.endDate);
      setTargets(goal.targets.map(t => ({
        tempId: t.id,
        title: t.title,
        type: t.type,
        targetValue: t.targetValue,
        unit: t.unit ?? '',
      })));
    } else {
      setTitle('');
      setDescription('');
      setEmoji('🎯');
      setColor('blue');
      setTimeframe('quarterly');
      // Pre-seed one empty target row so the user sees what's required
      // and doesn't have to click "+ Add target" before they can save.
      setTargets([{
        tempId: Math.random().toString(36).slice(2),
        title: '',
        type: 'number',
        targetValue: 10,
        unit: '',
      }]);
      autoFillDates('quarterly');
    }
  }, [open, goal]);

  function autoFillDates(tf: GoalTimeframe) {
    const now = new Date();
    let start: Date, end: Date;
    switch (tf) {
      case 'weekly': start = startOfWeek(now, { weekStartsOn: 1 }); end = endOfWeek(now, { weekStartsOn: 1 }); break;
      case 'monthly': start = startOfMonth(now); end = endOfMonth(now); break;
      case 'quarterly': start = startOfQuarter(now); end = endOfQuarter(now); break;
      case 'yearly': start = startOfYear(now); end = endOfYear(now); break;
      default: return;
    }
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
  }

  function handleTimeframeChange(tf: GoalTimeframe) {
    setTimeframe(tf);
    if (tf !== 'custom') autoFillDates(tf);
  }

  function addTargetInput() {
    setTargets(prev => [...prev, {
      tempId: Math.random().toString(36).slice(2),
      title: '',
      type: 'number',
      targetValue: 10,
      unit: '',
    }]);
  }

  function removeTargetInput(tempId: string) {
    setTargets(prev => prev.filter(t => t.tempId !== tempId));
  }

  function updateTargetInput(tempId: string, field: keyof TargetInput, value: string | number) {
    setTargets(prev => prev.map(t =>
      t.tempId === tempId ? { ...t, [field]: value } : t
    ));
  }

  // Sub-goals are mandatory on create — a goal without measurable targets
  // can't be tracked, completed, or auto-graded. The Save button is disabled
  // until the user has added at least one target with a non-empty title.
  const validTargets = targets.filter(t => t.title.trim()).map(t => ({
    title: t.title.trim(),
    type: t.type,
    targetValue: t.type === 'boolean' ? 1 : t.targetValue,
    unit: t.unit.trim() || undefined,
  }));

  const canSave = Boolean(
    title.trim() && startDate && endDate && (isEdit || validTargets.length > 0),
  );

  function handleSave() {
    if (!canSave) return;

    if (isEdit && goal) {
      updateGoal(goal.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        emoji,
        color,
        timeframe,
        startDate,
        endDate,
      });
    } else {
      const created = addGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        emoji,
        color,
        timeframe,
        startDate,
        endDate,
        targets: validTargets,
      });
      // Pass the optimistic id back so the parent can show AI suggestions.
      // The parent will wait for the optimistic→UUID swap before calling
      // /api/goals/[id]/suggest-tasks (resolveGoalDbId handles that).
      if (created) onCreated?.(created.id);
    }
    onClose();
  }

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Goal' : 'Create Goal'}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
        {/* Emoji picker */}
        <div>
          <Label className="text-xs mb-1.5">Icon</Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(prev => !prev)}
              className="w-12 h-12 rounded-xl border border-border bg-card flex items-center justify-center text-2xl hover:bg-muted transition-colors"
            >
              {emoji}
            </button>
            {showEmojiPicker && (
              <div className="absolute top-14 left-0 z-50 grid grid-cols-10 gap-1 p-2 rounded-xl border border-border bg-popover shadow-lg">
                {EMOJI_PRESETS.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                    className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted text-lg transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <div>
          <Label className="text-xs mb-1.5">Title <span className="text-destructive">*</span></Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Ship v2.0"
            className="rounded-lg"
            autoFocus
          />
        </div>

        {/* Color */}
        <div>
          <Label className="text-xs mb-1.5">Color</Label>
          <div className="flex flex-wrap items-center gap-2 py-1.5 px-0.5">
            {GOAL_COLORS.map(c => {
              const cls = GOAL_COLOR_MAP[c];
              const selected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all flex-shrink-0 ${
                    selected ? 'ring-2 ring-offset-2 ring-offset-card scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: cls.hex,
                    ...(selected ? { boxShadow: `0 0 0 2px hsl(var(--card)), 0 0 0 4px ${cls.hex}66` } : {}),
                  }}
                  aria-label={c}
                  aria-pressed={selected}
                />
              );
            })}
          </div>
        </div>

        {/* Timeframe */}
        <div>
          <Label className="text-xs mb-1.5">Timeframe</Label>
          <div className="flex flex-wrap gap-1.5">
            {(['weekly', 'monthly', 'quarterly', 'yearly', 'custom'] as GoalTimeframe[]).map(tf => (
              <button
                key={tf}
                type="button"
                onClick={() => handleTimeframeChange(tf)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  timeframe === tf ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {TIMEFRAME_LABELS[tf]}
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs mb-1.5">Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="rounded-lg text-xs"
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5">End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="rounded-lg text-xs"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <Label className="text-xs mb-1.5">Description (optional)</Label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does success look like?"
            rows={2}
            className="rounded-lg text-sm resize-none"
          />
        </div>

        {/* Targets — mandatory on create */}
        {!isEdit && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label className="text-xs">
                Key Results / Targets <span className="text-destructive">*</span>
              </Label>
              {targets.filter(t => t.title.trim()).length === 0 && (
                <span className="text-[10px] text-amber-400/90">At least one is required</span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/70 -mt-1">
              Goals need measurable sub-goals to track progress.
            </p>
            {targets.map(t => (
              <div key={t.tempId} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/20">
                <Input
                  value={t.title}
                  onChange={e => updateTargetInput(t.tempId, 'title', e.target.value)}
                  placeholder="Target title..."
                  className="flex-1 h-7 text-xs bg-transparent border-0 shadow-none px-1"
                />
                <Select
                  value={t.type}
                  onValueChange={v => updateTargetInput(t.tempId, 'type', v)}
                >
                  <SelectTrigger className="w-[90px] h-7 text-[11px] rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="percentage">%</SelectItem>
                    <SelectItem value="boolean">Yes/No</SelectItem>
                    <SelectItem value="task_completion">Tasks</SelectItem>
                  </SelectContent>
                </Select>
                {t.type !== 'boolean' && t.type !== 'task_completion' && (
                  <Input
                    type="number"
                    value={t.targetValue}
                    onChange={e => updateTargetInput(t.tempId, 'targetValue', Number(e.target.value))}
                    className="w-14 h-7 text-[11px] rounded-md px-2"
                    min={1}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeTargetInput(t.tempId)}
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addTargetInput}
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              + Add target
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-lg">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg px-5"
            title={!canSave && !isEdit && validTargets.length === 0 ? 'Add at least one sub-goal first' : undefined}
          >
            {isEdit ? 'Save Changes' : 'Create Goal'}
          </Button>
        </div>
      </div>
    </MobileBottomSheet>
  );
};
