'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useCalendarStore } from '../store/useCalendarStore';
import { useCalendarEventsStore } from '../store/useCalendarEventsStore';
import { useFocusStore } from '../store/useFocusStore';
import {
  ClockIcon, TargetIcon, ActivityIcon, CalendarIcon, SparkIcon as ZapIcon, PlusIcon, CloseIcon, CheckIcon as CheckCircle2Icon
} from './icons';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { EVENT_COLORS } from '../constants';
import notify from '../utils/notify';
import { uid } from '../lib/uid';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Separator } from './ui/separator';
import ParsedEventConfirmCard from './intelligence/ParsedEventConfirmCard';
import type { ParsedEventData } from './intelligence/ParsedEventConfirmCard';
import type { RecurrenceRule } from '../types';
import { buildRRule } from '../lib/recurrence/rruleEngine';

/* --- Section wrapper -------------------------------------------------------- */
const Section: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, action, children }) => (
  <section className="space-y-5">
    <div className="flex items-end justify-between">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    <Separator />
    {children}
  </section>
);

/* --- Metric block ----------------------------------------------------------- */
const Metric: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
}> = ({ label, value, sub, icon }) => (
  <div className="flex flex-col gap-1 py-4 px-5 rounded-xl border border-border/60 bg-background">
    <div className="flex items-center gap-1.5 mb-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
    <div className="text-2xl font-semibold text-foreground font-display leading-none">{value}</div>
    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

const Profile: React.FC = () => {
  const profile               = useCalendarStore(s => s.profile);
  const updateProfile         = useCalendarStore(s => s.updateProfile);
  const addGoal               = useCalendarStore(s => s.addGoal);
  const toggleGoal            = useCalendarStore(s => s.toggleGoal);
  const deleteGoal            = useCalendarStore(s => s.deleteGoal);
  const calculateIntelligence = useCalendarStore(s => s.calculateIntelligence);
  const events   = useCalendarEventsStore(s => s.events);
  const addEvent = useCalendarEventsStore(s => s.addEvent);

  const intel = profile.intelligence;
  const goals = Array.isArray(profile.goals) ? profile.goals : [];

  const [isEditing, setIsEditing] = useState(false);
  const [newGoalText, setNewGoalText] = useState('');
  const [commitmentText, setCommitmentText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [parsedEvent, setParsedEvent] = useState<ParsedEventData | null>(null);
  const commitmentInputRef = useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState({
    name: profile.name,
    role: profile.role,
    bio: profile.bio,
    email: profile.email,
  });

  const handleSave = () => {
    updateProfile(editForm);
    setIsEditing(false);
    calculateIntelligence();
    notify('Profile saved.');
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoalText.trim()) { addGoal(newGoalText.trim()); setNewGoalText(''); }
  };

  const handleParseCommitment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = commitmentText.trim();
    if (!raw || isParsing) return;
    if (raw.length < 3) {
      toast.error("Too short. Try something like \"Meeting at 4pm\"");
      return;
    }
    setIsParsing(true);
    try {
      const res = await fetch('/api/intelligence/parse-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: raw,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          referenceDate: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          toast.error('AI quota exceeded — please try again in a few minutes.');
        } else if (res.status === 503) {
          toast.error('AI service is unavailable. Check back soon.');
        } else {
          toast.error("Couldn't understand that. Try being more specific.");
        }
        return;
      }
      const data = await res.json();
      if (data.parsed) {
        setParsedEvent(data.parsed as ParsedEventData);
      } else {
        toast.error("Couldn't understand that. Try being more specific.");
      }
    } catch {
      toast.error("Couldn't reach the server. Check your connection.");
    } finally {
      setIsParsing(false);
    }
  }, [commitmentText, isParsing]);

  const handleConfirmEvent = useCallback(async () => {
    if (!parsedEvent) return;
    setIsConfirming(true);
    try {
      // Build recurrence data for the API
      let recurrencePayload: { rrule: string; exdates?: string[]; until?: string } | undefined;
      let recurrenceForStore: RecurrenceRule | undefined;

      if (parsedEvent.recurrence) {
        const r = parsedEvent.recurrence;
        const rrule = buildRRule({
          freq: r.frequency.toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'yearly',
          interval: r.interval,
          byDay: r.weekDays.length > 0 ? r.weekDays : undefined,
          count: r.endMode === 'after_count' && r.endCount ? r.endCount : undefined,
          until: r.endMode === 'on_date' && r.endDate ? r.endDate : undefined,
        });
        recurrencePayload = { rrule };
        if (r.endDate) recurrencePayload.until = r.endDate;

        // Map weekDays to day-of-week numbers for the store
        const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
        recurrenceForStore = {
          frequency: r.frequency,
          interval: r.interval,
          daysOfWeek: r.weekDays.map(d => dayMap[d]).filter((n): n is number => n !== undefined),
          endCondition: r.endMode === 'after_count' && r.endCount
            ? { type: 'COUNT', count: r.endCount }
            : r.endMode === 'on_date' && r.endDate
              ? { type: 'UNTIL', untilDate: r.endDate }
              : { type: 'NEVER' },
          rrule,
        };
      }

      const eventBody = {
        title: parsedEvent.title,
        description: parsedEvent.description ?? `Created from commitment`,
        date: parsedEvent.date,
        startTime: parsedEvent.startTime,
        endTime: parsedEvent.endTime,
        category: 'Work',
        location: parsedEvent.location,
        isAllDay: parsedEvent.isAllDay,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        createdViaNL: true,
        recurrence: recurrencePayload,
      };

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      });

      if (!res.ok) {
        toast.error('Failed to add event. Try again.');
        return;
      }

      const data = await res.json();

      // Add to store optimistically
      addEvent({
        id: data.id,
        title: parsedEvent.title,
        description: parsedEvent.description ?? `Created from commitment`,
        date: parsedEvent.date,
        startTime: parsedEvent.startTime,
        endTime: parsedEvent.endTime,
        category: 'Work',
        color: EVENT_COLORS['Work'] ?? '#6D59E0',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        completed: false,
        location: parsedEvent.location ?? undefined,
        recurrence: recurrenceForStore,
        createdViaNL: true,
      });

      calculateIntelligence();
      toast.success('Added to calendar');
      setParsedEvent(null);
      setCommitmentText('');
      setTimeout(() => commitmentInputRef.current?.focus(), 100);
    } catch {
      toast.error('Failed to add event. Try again.');
    } finally {
      setIsConfirming(false);
    }
  }, [parsedEvent, addEvent, calculateIntelligence]);

  const handleEditParsedEvent = useCallback(() => {
    if (!parsedEvent) return;
    // Open EventModal pre-populated with parsed date/time
    const { openModal } = useCalendarStore.getState();
    openModal(undefined, parsedEvent.date, parsedEvent.startTime);
    setParsedEvent(null);
  }, [parsedEvent]);

  const fragLabel =
    intel.fragmentationScore < 30 ? 'Low' :
    intel.fragmentationScore < 60 ? 'Medium' : 'High';

  const fragColor =
    intel.fragmentationScore < 30 ? 'text-emerald-600 dark:text-emerald-400' :
    intel.fragmentationScore < 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  const densityH = Math.floor((intel.schedulingDensity / 100) * 1440 / 60);
  const densityM = Math.round(((intel.schedulingDensity / 100) * 1440) % 60);

  const commitmentEvents = events
    .filter(e => e.createdViaNL || e.description?.startsWith('Created from commitment:'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
    .slice(0, 5);

  // Focus sessions come from useFocusStore (DB-backed), not from calendar events.
  // The store is hydrated by PersistenceBootstrap on login.
  const focusSessionHistory = useFocusStore(s => s.sessionHistory);
  // sessionHistory is already newest-first (prepended on each finish)
  const recentFocusSessions = focusSessionHistory.slice(0, 5);

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 pb-24 space-y-12">

      {/* -- Header ------------------------------------------------------------- */}
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-14 w-14 rounded-full">
            <AvatarImage src={profile.avatarUrl} alt={profile.name} className="rounded-full object-cover" />
            <AvatarFallback className="rounded-full bg-muted text-foreground text-xl font-semibold">
              {profile.name.charAt(0)}
            </AvatarFallback>
          </Avatar>

          <div className={isEditing ? 'flex flex-col gap-2' : 'space-y-0.5'}>
            {isEditing ? (
              <input
                className="font-display text-2xl font-semibold tracking-tight bg-muted/50 rounded-lg px-2 py-1 outline-none text-foreground border border-border/60 focus:border-primary/30 transition-colors w-full block"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Your name"
              />
            ) : (
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground leading-none">
                {profile.name}
              </h1>
            )}
            {isEditing ? (
              <input
                className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-2 py-1 outline-none border border-border/60 focus:border-primary/30 transition-colors w-full block"
                value={editForm.role}
                onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                placeholder="Your role"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{profile.role}</p>
            )}
          </div>
        </div>

        <button
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-border/60 bg-background hover:bg-muted/50 text-foreground transition-colors duration-150 whitespace-nowrap"
        >
          {isEditing ? 'Save' : 'Edit Profile'}
        </button>
      </header>

      {/* -- Metrics ------------------------------------------------------------ */}
      <Section title="Insights" subtitle="Derived from your schedule and focus history">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric
            label="Focus Streak"
            icon={<TargetIcon size={13} strokeWidth={1.5} />}
            value={<span className="text-primary">{intel.focusStreak}</span>}
            sub="consecutive days"
          />
          <Metric
            label="Peak Hours"
            icon={<ClockIcon size={13} strokeWidth={1.5} />}
            value={<span className="text-xl">{intel.peakFocusHours}</span>}
            sub="most productive window"
          />
          <Metric
            label="Density Today"
            icon={<ActivityIcon size={13} strokeWidth={1.5} />}
            value={
              <span>
                {intel.schedulingDensity}
                <span className="text-base font-normal text-muted-foreground">%</span>
              </span>
            }
            sub={`${densityH}h ${densityM}m scheduled`}
          />
          <Metric
            label="Fragmentation"
            icon={<ActivityIcon size={13} strokeWidth={1.5} />}
            value={<span className={fragColor}>{fragLabel}</span>}
            sub={`${intel.contextSwitchesToday} context switch${intel.contextSwitchesToday !== 1 ? 'es' : ''}`}
          />
        </div>
      </Section>

      {/* -- Deep Work + Best Slot ----------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <Section title="Deep Work Today">
          {intel.deepWorkBlocksToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deep work blocks (60+ min) logged today.</p>
          ) : (
            <div className="space-y-2">
              {intel.deepWorkBlocksToday.map((block, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-l-2 border-primary/40 pl-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{block.start} – {block.end}</p>
                    <p className="text-xs text-muted-foreground">Deep focus block</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Best Upcoming Slot">
          {intel.suggestedFocusSlot ? (
            <div className="space-y-1 py-2.5 border-l-2 border-border/60 pl-3">
              <p className="text-xs text-muted-foreground">{intel.suggestedFocusSlot.date}</p>
              <p className="font-display text-xl font-semibold text-foreground">
                {intel.suggestedFocusSlot.start} – {intel.suggestedFocusSlot.end}
              </p>
              <p className="text-xs text-muted-foreground">90-minute free window near your peak hours.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No free 90-min window found in the next 3 days.</p>
          )}
        </Section>
      </div>

      {/* -- Commitments + Sessions ---------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

        {/* Commitments */}
        <div className="lg:col-span-2 space-y-12">
          <Section
            title="Commitments"
            subtitle="Smart scheduling – describe an event in plain English"
          >
            <form onSubmit={handleParseCommitment} className="relative">
              <input
                ref={commitmentInputRef}
                type="text"
                placeholder='e.g. "Standup every weekday at 9am for 30 mins"'
                value={commitmentText}
                onChange={e => setCommitmentText(e.target.value)}
                disabled={isParsing}
                className="w-full pl-4 pr-14 py-2.5 rounded-xl bg-muted/40 border border-border/60 outline-none text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/30 transition-colors duration-150 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isParsing || !commitmentText.trim()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isParsing
                  ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  : <PlusIcon size={15} strokeWidth={1.5} />}
              </button>
            </form>

            {/* Confirmation card */}
            <AnimatePresence mode="wait">
              {parsedEvent && (
                <ParsedEventConfirmCard
                  key="confirm-card"
                  parsed={parsedEvent}
                  onConfirm={handleConfirmEvent}
                  onEdit={handleEditParsedEvent}
                  onDismiss={() => setParsedEvent(null)}
                  isLoading={isConfirming}
                />
              )}
            </AnimatePresence>

            {commitmentEvents.length > 0 ? (
              <div className="space-y-1 max-h-64 overflow-y-auto no-scrollbar">
                <AnimatePresence initial={false}>
                  {commitmentEvents.map(ev => (
                    <motion.div
                      key={ev.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/40 transition-colors duration-150 group"
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">{ev.date} · {ev.startTime}–{ev.endTime}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 uppercase tracking-wide">{ev.category}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No commitments yet. Describe an event above and press Enter.</p>
            )}
          </Section>

          {/* Goals */}
          <Section title="Goals">
            <form onSubmit={handleAddGoal} className="relative">
              <input
                type="text"
                placeholder="Add a goal…"
                value={newGoalText}
                onChange={e => setNewGoalText(e.target.value)}
                className="w-full pl-4 pr-12 py-2.5 rounded-xl bg-muted/40 border border-border/60 outline-none text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/30 transition-colors duration-150"
              />
              <button type="submit" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <PlusIcon size={15} strokeWidth={1.5} />
              </button>
            </form>

            {goals.length > 0 && (
              <div className="space-y-1 max-h-56 overflow-y-auto no-scrollbar">
                <AnimatePresence initial={false}>
                  {goals.map(goal => (
                    <motion.div
                      key={goal.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="group flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/40 transition-colors duration-150"
                    >
                      <button
                        onClick={() => toggleGoal(goal.id)}
                        className={`flex-shrink-0 transition-colors ${goal.completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
                      >
                        {goal.completed
                          ? <CheckCircle2Icon size={16} strokeWidth={1.5} />
                          : <div className="w-4 h-4 rounded-full border border-current" />}
                      </button>
                      <span className={`flex-1 text-sm ${goal.completed ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}`}>
                        {goal.text}
                      </span>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all"
                      >
                        <CloseIcon size={13} strokeWidth={1.5} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </Section>
        </div>

        {/* Recent Sessions */}
        <Section title="Recent Sessions">
          {recentFocusSessions.length > 0 ? (
            <div className="space-y-3">
              {recentFocusSessions.map(s => {
                const startDate = new Date(s.startTime);
                const dateLabel = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const timeLabel = startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                const durationMins = Math.round(s.duration / 60);
                return (
                  <div key={s.id} className="flex flex-col gap-0.5 border-l-2 border-border/60 pl-3 py-0.5">
                    <span className="text-sm font-medium text-foreground truncate">
                      {s.taskTitle ?? 'Focus session'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dateLabel} · {timeLabel} · {durationMins}m
                      {!s.completed && <span className="ml-1 text-muted-foreground/50">(partial)</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No completed focus sessions yet.</p>
          )}
        </Section>
      </div>
    </div>
  );
};

export default Profile;
