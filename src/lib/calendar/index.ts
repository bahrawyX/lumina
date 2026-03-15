export type { CalendarProvider, CalendarProviderEvent } from "./types";
export { LocalCalendarProvider } from "./local";
export { OutlookCalendarProvider } from "./outlook";
export { GoogleCalendarProvider } from "./google";

import type { CalendarProvider } from "./types";
import { LocalCalendarProvider } from "./local";
import { OutlookCalendarProvider } from "./outlook";
import { GoogleCalendarProvider } from "./google";

const providers: Record<string, CalendarProvider> = {
  local: new LocalCalendarProvider(),
  outlook: new OutlookCalendarProvider(),
  google: new GoogleCalendarProvider(),
};

export function getCalendarProvider(
  name: "local" | "google" | "outlook"
): CalendarProvider {
  return providers[name];
}
