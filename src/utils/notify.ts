/**
 * notify — lightweight notifier utility backed by Sonner.
 *
 * Call this anywhere (components, store actions, services).
 * Uses Sonner's module-level `toast` function — no React hook required.
 *
 * Examples:
 *   notify('Event created: Design Review (3:00–4:00)');
 *   notify('Event deleted.', () => useCalendarStore.getState().undo());
 */
import { toast } from 'sonner';

interface NotifyOptions {
  /**
   * Stable id. A later call with the same id REPLACES the toast instead of
   * stacking a second one beneath it.
   *
   * This exists because optimistic writes announce success and then, on a
   * failed save, announce failure — leaving the user reading
   * "Event created: team standup" directly above
   * "Couldn't save \"team standup\" — please try again."
   * Two toasts, opposite meanings, both true at different moments and
   * contradictory on screen.
   */
  id?: string;
  /** Renders as an error toast. */
  error?: boolean;
}

const notify = (
  message: string,
  undoFn?: () => void,
  duration = 3500,
  options: NotifyOptions = {},
): void => {
  const config: Parameters<typeof toast>[1] = { duration };
  if (options.id) config.id = options.id;
  if (undoFn) {
    config.action = { label: 'Undo', onClick: undoFn };
  }
  if (options.error) {
    toast.error(message, config);
    return;
  }
  toast(message, config);
};

export default notify;
