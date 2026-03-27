'use client';

import React, { useState, useRef } from 'react';
import { useCalendarStore } from '../store/useCalendarStore';
import { useCalendarEventsStore } from '../store/useCalendarEventsStore';
import {
  ClockIcon, TargetIcon, ActivityIcon, CalendarIcon, SparkIcon as ZapIcon, PlusIcon, CloseIcon, CheckIcon as CheckCircle2Icon
} from './icons';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { parseCommitment } from '../lib/parseCommitment';
import { EVENT_COLORS } from '../constants';
import notify from '../utils/notify';
import { uid } from '../lib/uid';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Separator } from './ui/separator';

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
  const {
    profile, updateProfile,
    addGoal, toggleGoal, deleteGoal,
    calculateIntelligence,
  } = useCalendarStore();
  const { events, addEvent } = useCalendarEventsStore();

  const intel = profile.intelligence;
  const goals = Array.isArray(profile.goals) ? profile.goals : [];

  const [isEditing, setIsEditing] = useState(false);
  const [newGoalText, setNewGoalText] = useState('');
  const [commitmentText, setCommitmentText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
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

  const handleCreateCommitment = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = commitmentText.trim();
    if (!raw || isParsing) return;
    setIsParsing(true);
    const loadingId = toast.loading('Analyzing commitment…');
    try {
      const parsed = await parseCommitment(raw);
      const id = uid('ev_');
      addEvent({
        id,
        title: parsed.title,
        description: `Created from commitment: "${raw}"`,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        category: parsed.category,
        color: EVENT_COLORS[parsed.category],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        completed: false,
      });
      calculateIntelligence();
      toast.dismiss(loadingId);
      toast.success(`Event created: ${parsed.title}`, {
        description: `${parsed.date} · ${parsed.startTime}–${parsed.endTime}`,
      });
      setCommitmentText('');
      setTimeout(() => commitmentInputRef.current?.focus(), 100);
    } catch (err) {
      console.error('Commitment parse error:', err);
      toast.dismiss(loadingId);
      toast.error("Couldn't understand the commitment", {
        description: 'Try adding a time or date. E.g. "Meeting at 4pm on the 23rd"',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const fragLabel =
    intel.fragmentationScore < 30 ? 'Low' :
    intel.fragmentationScore < 60 ? 'Medium' : 'High';

  const fragColor =
    intel.fragmentationScore < 30 ? 'text-emerald-600 dark:text-emerald-400' :
    intel.fragmentationScore < 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  const densityH = Math.floor((intel.schedulingDensity / 100) * 1440 / 60);
  const densityM = Math.round(((intel.schedulingDensity / 100) * 1440) % 60);

  const commitmentEvents = events
    .filter(e => e.description?.startsWith('Created from commitment:'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
    .slice(0, 8);

  const focusSessions = events.filter(e => e.completed && e.category === 'Focus').slice(-5).reverse();

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
      <Section title="Intelligence" subtitle="Derived from your schedule and focus history">
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
            <form onSubmit={handleCreateCommitment} className="relative">
              <input
                ref={commitmentInputRef}
                type="text"
                placeholder='e.g. "Meeting with Sarah at 4pm on the 23rd"'
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
          {focusSessions.length > 0 ? (
            <div className="space-y-3">
              {focusSessions.map(e => (
                <div key={e.id} className="flex flex-col gap-0.5 border-l-2 border-border/60 pl-3 py-0.5">
                  <span className="text-sm font-medium text-foreground truncate">{e.title}</span>
                  <span className="text-xs text-muted-foreground">{e.date} · {e.startTime}</span>
                </div>
              ))}
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
