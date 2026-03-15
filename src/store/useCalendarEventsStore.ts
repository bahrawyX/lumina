import { create } from 'zustand';
import { CalendarEvent } from '../types';
import notify from '../utils/notify';
import { useTaskBoardStore } from './useTaskBoardStore';

interface HistoryState {
  events: CalendarEvent[];
}

interface CalendarEventsState {
  events: CalendarEvent[];
  history: HistoryState[];
  historyIndex: number;

  addEvent: (event: CalendarEvent) => void;
  updateEvent: (event: CalendarEvent) => void;
  toggleEventCompletion: (id: string) => void;
  deleteEvent: (id: string) => void;
  moveEvent: (id: string, newDate: string, startTime?: string, endTime?: string) => void;

  undo: () => void;
  redo: () => void;
}

const saveState = (events: CalendarEvent[]) => {
  localStorage.setItem('lumina_events', JSON.stringify(events));
};

function loadEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem('lumina_events');
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
  events: (() => { const e = loadEvents(); return e; })(),
  history: (() => { const e = loadEvents(); return [{ events: e }]; })(),
  historyIndex: 0,

  addEvent: (event) => {
    if (event.startTime && event.endTime && !isValidEventTimes(event.startTime, event.endTime)) {
      notify('Invalid event times — start must be before end');
      return;
    }
    const { events, history, historyIndex } = get();
    const newEvents = [...events, event];
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
    const timeRange = event.startTime && event.endTime ? ` (${event.startTime}–${event.endTime})` : '';
    notify(`Event created: ${event.title}${timeRange}`);
  },

  updateEvent: (event) => {
    if (event.startTime && event.endTime && !isValidEventTimes(event.startTime, event.endTime)) {
      notify('Invalid event times — start must be before end');
      return;
    }
    const { events, history, historyIndex } = get();
    const newEvents = events.map((e) => e.id === event.id ? event : e);
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
    notify(`Event updated: ${event.title}`);
  },

  toggleEventCompletion: (id) => {
    const { events, history, historyIndex } = get();
    const newEvents = events.map((e) => e.id === id ? { ...e, completed: !e.completed } : e);
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
  },

  deleteEvent: (id) => {
    const { events, history, historyIndex } = get();
    const deleted = events.find((e) => e.id === id);
    const newEvents = events.filter((e) => e.id !== id);
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
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
    const { events, history, historyIndex } = get();
    const moved = events.find((e) => e.id === id);
    const newEvents = events.map((e) => e.id === id ? {
      ...e,
      date: newDate,
      startTime: startTime || e.startTime,
      endTime: endTime || e.endTime
    } : e);
    const newHistory = [...history.slice(0, historyIndex + 1), { events: newEvents }].slice(-50);
    saveState(newEvents);
    set({ events: newEvents, history: newHistory, historyIndex: newHistory.length - 1 });
    triggerIntelligence();
    if (moved) notify(`Event moved: ${moved.title}`, () => get().undo());
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const state = history[newIndex];
      saveState(state.events);
      set({ events: state.events, historyIndex: newIndex });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const state = history[newIndex];
      saveState(state.events);
      set({ events: state.events, historyIndex: newIndex });
    }
  },
}));
