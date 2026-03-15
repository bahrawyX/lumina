/**
 * notify — lightweight notifier utility.
 *
 * Call this anywhere (components, store actions, services).
 * It accesses the Zustand store directly — no React hook required.
 *
 * Examples:
 *   notify('Event created: Design Review (3:00–4:00)');
 *   notify('Event deleted.', () => useCalendarStore.getState().undo());
 */
import { useToastStore } from '../store/useToastStore';

const notify = (
  message: string,
  undoFn?: () => void,
  duration = 3500
): void => {
  useToastStore.getState().addToast({ message, undoFn, duration });
};

export default notify;
