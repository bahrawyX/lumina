import { create } from 'zustand';
import type { CalendarEvent, EditScope } from '../types';
import notify from '../utils/notify';
import { useTaskBoardStore } from './useTaskBoardStore';
import { useLinkStore } from './useLinkStore';
import * as eventsPersistence from '@/lib/persistence/eventsPersistence';
import { getStorageItem, setStorageItem } from '@/lib/storage';

const isDev = process.env.NODE_ENV === 'development';

/** Returns null when userId is unknown in production — callers must guard on null. */
function storageKey(userId: string | null): string | null {
  if (userId) return `lumina_events_${userId}`;
  return isDev ? 'lumina_events' : null;
}

interface HistoryState {
  events: CalendarEvent[];
}

interface CalendarEventsState {
  events: CalendarEvent[];
  /** Virtual instances from recurring event expansion */
  recurringInstances: CalendarEvent[];
  history: HistoryState[];
  historyIndex: number;
  dbHydrated: boolean;
  userId: string | null;

  hydrateFromDb: (events: CalendarEvent[]) => void;
  hydrateFromDbFailed: () => void;
  setUserId: (userId: string) => void;
  addEvent: (event: CalendarEvent) => void;
  /** Add event to local state only (no DB persistence). Use when persistence is handled externally. */
  addEventOptimistic: (event: CalendarEvent) => void;
  updateEvent: (event: CalendarEvent, editScope?: EditScope) => void;
  toggleEventCompletion: (id: string) => void;
  deleteEvent: (id: string, editScope?: EditScope) => void;
  moveEvent: (id: string, newDate: string, startTime?: string, endTime?: string) => void;
  fetchRecurringInstances: (start: string, end: string) => Promise<void>;

  undo: () => void;
  redo: () => void;
}

const saveState = (events: CalendarEvent[], userId: string | null) => {
  setStorageItem(storageKey(userId), JSON.stringify(events));
};

function loadEvents(userId: string | null): CalendarEvent[] {
  try {
    const raw = getStorageItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Notify useCalendarStore to recalculate intelligence after any event mutation. */
const triggerIntelligence = () =>
  import('./useCalendarStore').then(({ useCalendarStore }) =>
    useCalendarStore.getState().calculateIntelligence()
  );

/** Validate time fields: HH:mm format, valid ranges, endTime > startTime, min 1 min duration. */
function isValidEventTimes(startTime: string, endTime: string): boolean {
  const HH_MM = /^\d{2}:\d{2}$/;
  if (!HH_MM.test(startTime) || !HH_MM.test(endTime)) return false;
  const toMin = (t: string) => {
    const h = parseInt(t.slice(0, 2), 10);
    const m = parseInt(t.slice(3), 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
    return h * 60 + m;
  };
  const s = toMin(startTime);
  const e = toMin(endTime);
  if (s < 0 || e < 0) return false;
  return e > s && e - s >= 1;
}

export const useCalendarEventsStore = create<CalendarEventsState>((set, get) => ({
  // DB is the source of truth — start empty, never read localStorage on init.
  events: [],
  recurringInstances: [],
  history: [{ events: [] }],
  historyIndex: 0,
  dbHydrated: false,
  userId: null,

  setUserId: (userId) => {
    set({ userId });
  },

  hydrateFromDb: (dbEvents) => {
    if (get().dbHydrated) return;
    set({
      dbHydrated: true,
      events: dbEvents,
      history: [{ events: dbEvents }],
      historyIndex: 0,
    });
    triggerIntelligence();
  },

  hydrateFromDbFailed: () => {
    if (get().dbHydrated) return;
    if (isDev) {
      const fallback = loadEvents(get().userId);
      set({
        dbHydrated: true,
        events: fallback,
        history: [{ events: fallback }],
        historyIndex: 0,
      });
      triggerIntelligence();
    }
  },


  addEvent: (event) => {
    if (event.startTime && event.endTime && !isValidEventTimes(event.startTime, event.endTime)) {
      notify('Invalid event times — start must be before end');
      return;
    }
    const { events, history, historyIndex, userId } = get();
    const newEvents = [...events, event];
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents, userId);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
    // Fire-and-forget DB persistence
    eventsPersistence.createOne(event);
    const timeRange = event.startTime && event.endTime ? ` (${event.startTime}–${event.endTime})` : '';
    notify(`Event created: ${event.title}${timeRange}`);
  },

  addEventOptimistic: (event) => {
    if (event.startTime && event.endTime && !isValidEventTimes(event.startTime, event.endTime)) {
      notify('Invalid event times — start must be before end');
      return;
    }
    const { events, history, historyIndex, userId } = get();
    const newEvents = [...events, event];
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents, userId);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
    // No DB persistence — caller handles it (e.g. via createLinkedEvent)
  },

  updateEvent: (event, editScope) => {
    if (event.startTime && event.endTime && !isValidEventTimes(event.startTime, event.endTime)) {
      notify('Invalid event times — start must be before end');
      return;
    }
    const { events, history, historyIndex, userId } = get();

    // For recurring instance edits with 'this' scope, handle via API and refresh instances
    if (editScope === 'this' && event.id.includes(':')) {
      fetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...event, editScope: 'this' }),
      }).then(() => {
        // Remove the virtual instance and refresh
        set({ recurringInstances: get().recurringInstances.filter((e) => e.id !== event.id) });
        notify(`Instance updated: ${event.title}`);
        triggerIntelligence();
      });
      return;
    }

    const oldEvent = events.find((e) => e.id === event.id);
    const newEvents = events.map((e) => e.id === event.id ? event : e);
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents, userId);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
    // Fire-and-forget DB persistence
    const body = editScope ? { ...event, editScope } : event;
    eventsPersistence.updateOne(event.id, body);
    notify(`Event updated: ${event.title}`);
    // Prompt task completion when event marked complete
    if (event.completed && !oldEvent?.completed && event.linkedTaskId) {
      const task = useTaskBoardStore.getState().tasks.find((t) => t.id === event.linkedTaskId);
      if (task && task.status !== 'done') {
        useLinkStore.getState().promptTaskCompletion(task.id, task.title);
      }
    }
  },

  toggleEventCompletion: (id) => {
    const { events, history, historyIndex, userId } = get();
    const oldEvent = events.find((e) => e.id === id);
    const newEvents = events.map((e) => e.id === id ? { ...e, completed: !e.completed } : e);
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents, userId);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
    // Prompt task completion when event toggled to complete
    if (!oldEvent?.completed && oldEvent?.linkedTaskId) {
      const task = useTaskBoardStore.getState().tasks.find((t) => t.id === oldEvent.linkedTaskId);
      if (task && task.status !== 'done') {
        useLinkStore.getState().promptTaskCompletion(task.id, task.title);
      }
    }
  },

  deleteEvent: (id, editScope) => {
    // For recurring instance deletion with 'this' scope
    if (editScope === 'this' && id.includes(':')) {
      fetch(`/api/events/${id}?editScope=this`, { method: 'DELETE' }).then(() => {
        set({ recurringInstances: get().recurringInstances.filter((e) => e.id !== id) });
        triggerIntelligence();
        notify('Instance removed');
      });
      return;
    }

    const { events, history, historyIndex, userId } = get();
    const deleted = events.find((e) => e.id === id);
    const newEvents = events.filter((e) => e.id !== id);
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents, userId);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    // Fire-and-forget DB persistence
    const scopeParam = editScope ? `?editScope=${editScope}` : '';
    eventsPersistence.deleteOne(id, scopeParam);
    if (deleted?.linkedTaskId) {
      useTaskBoardStore.getState().unlinkEvent(id);
    }
    triggerIntelligence();
    const label = deleted ? `Event deleted: ${deleted.title}` : 'Event deleted.';
    notify(
      label,
      deleted?.linkedTaskId
        ? () => {
            get().undo();
            useTaskBoardStore.getState().updateTask(deleted.linkedTaskId!, { linkedEventId: id });
          }
        : () => get().undo()
    );
  },

  moveEvent: (id, newDate, startTime, endTime) => {
    if (startTime && endTime && !isValidEventTimes(startTime, endTime)) return;
    const { events, history, historyIndex, userId } = get();
    const moved = events.find((e) => e.id === id);
    const newEvents = events.map((e) => e.id === id ? {
      ...e,
      date: newDate,
      startTime: startTime || e.startTime,
      endTime: endTime || e.endTime
    } : e);
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents, userId);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
    // Fire-and-forget DB persistence — only on commit (moveEvent = drag end)
    if (moved) eventsPersistence.updateOne(id, { date: newDate, startTime, endTime });
    if (moved) notify(`Event moved: ${moved.title}`, () => get().undo());
  },

  fetchRecurringInstances: async (start, end) => {
    try {
      const res = await fetch(`/api/events/expand?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      if (!res.ok) return;
      const data = await res.json();
      const instances = (data.instances ?? []) as CalendarEvent[];
      set({ recurringInstances: instances });
    } catch {
      // Silently fail — non-critical
    }
  },

  undo: () => {
    const { history, historyIndex, userId } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const state = history[newIndex];
      saveState(state.events, userId);
      set({ events: state.events, historyIndex: newIndex });
    }
  },

  redo: () => {
    const { history, historyIndex, userId } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const state = history[newIndex];
      saveState(state.events, userId);
      set({ events: state.events, historyIndex: newIndex });
    }
  },
}));
