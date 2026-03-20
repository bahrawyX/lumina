'use client';

import React, { useState, useEffect } from "react";
import { z } from "zod";
import { useCalendarStore } from "../store/useCalendarStore";
import { useCalendarEventsStore } from "../store/useCalendarEventsStore";
import { usePlannerStore } from "../store/usePlannerStore";
import { CalendarEvent, EventCategory } from "../types";
import { CATEGORIES } from "../constants";
import { parseEventNaturalLanguage } from "../services/geminiService";
import { timeToMinutes, minutesToTime } from "../utils/dateUtils";
import { SparkIcon, TrashIcon } from "./icons";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePicker from "./DatePicker";
import TimePicker from "./TimePicker";

/* ── Zod schema ──────────────────────────────────────────────────────────── */
const eventSchema = z.object({
  title: z.string().min(1, "Event name is required").max(100),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  category: z.string(),
}).refine((d) => timeToMinutes(d.endTime) > timeToMinutes(d.startTime), {
  message: "End time must be after start time",
  path: ["endTime"],
});

/* ── Component ───────────────────────────────────────────────────────────── */
const EventModal: React.FC = () => {
  const {
    isModalOpen, closeModal, selectedEventId,
    initialDateForNewEvent, initialTimeForNewEvent,
    timezone,
  } = useCalendarStore();
  const { events, addEvent, updateEvent, deleteEvent } = useCalendarEventsStore();
  const localEvent = events.find((e) => e.id === selectedEventId);
  const outlookEvents = usePlannerStore((s) => s.outlookEvents);
  const googleEvents = usePlannerStore((s) => s.googleEvents);
  const outlookEvent = outlookEvents.find((e) => e.id === selectedEventId);
  const googleEvent = googleEvents.find((e) => e.id === selectedEventId);
  const activeEvent = localEvent || outlookEvent || googleEvent;
  const provider = activeEvent?.provider
    || (activeEvent?.source === 'outlook' || activeEvent?.source === 'microsoft'
      ? 'microsoft'
      : activeEvent?.source === 'google'
        ? 'google'
        : 'local');
  const isExternalEvent = provider === 'google' || provider === 'microsoft';
  const isGoogleEvent = provider === 'google';
  const externalColor = activeEvent?.color || (isGoogleEvent ? '#4285F4' : '#0078D4');

  const [formData, setFormData] = useState<Partial<CalendarEvent>>({
    title: "", description: "", date: "",
    startTime: "09:00", endTime: "10:00", category: "Work", location: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [smartInput, setSmartInput] = useState("");
  const [smartOpen, setSmartOpen] = useState(false);

  useEffect(() => {
    if (!isModalOpen) return;
    if (activeEvent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(activeEvent);
    } else {
      const startTime = initialTimeForNewEvent || "09:00";
      const endTime = minutesToTime(Math.min(1435, timeToMinutes(startTime) + 60));
      setFormData({
        title: "", description: "",
        date: initialDateForNewEvent || new Date().toISOString().split("T")[0],
        startTime, endTime, category: "Work", location: "",
      });
    }
    setErrors({}); setSmartInput(""); setSmartOpen(false);
  }, [activeEvent, initialDateForNewEvent, initialTimeForNewEvent, isModalOpen]);

  /* Auto-adjust end time */
  useEffect(() => {
    const s = timeToMinutes(formData.startTime || "09:00");
    const e = timeToMinutes(formData.endTime || "10:00");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (e <= s) setFormData((prev) => ({ ...prev, endTime: minutesToTime(Math.min(1435, s + 30)) }));
  }, [formData.startTime, formData.endTime]);

  const handleSmartParse = async () => {
    if (!smartInput.trim()) return;
    setIsSmartLoading(true);
    const parsed = await parseEventNaturalLanguage(smartInput);
    if (parsed) {
      setFormData((prev) => ({ ...prev, ...parsed, category: (parsed.category as EventCategory) || prev.category }));
      setSmartInput(""); setSmartOpen(false);
    }
    setIsSmartLoading(false);
  };

  const handleSave = () => {
    const result = eventSchema.safeParse(formData);
    if (!result.success) {
      const fe: Record<string, string> = {};
      result.error.issues.forEach((i) => { if (i.path[0] != null) fe[i.path[0].toString()] = i.message; });
      setErrors(fe); return;
    }
    const finalEvent: CalendarEvent = {
      id: localEvent?.id || Math.random().toString(36).substr(2, 9),
      title: result.data.title,
      description: result.data.description || "",
      date: result.data.date,
      startTime: result.data.startTime,
      endTime: result.data.endTime,
      category: result.data.category as EventCategory,
      location: formData.location || "",
      color: CATEGORIES.find((c) => c.name === result.data.category)?.color || "#6D59E0",
      timezone: localEvent?.timezone || timezone,
    };
    if (localEvent) updateEvent(finalEvent); else addEvent(finalEvent);
    closeModal();
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
      <DialogContent className="sm:max-w-[480px] gap-0 p-0 overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              {isExternalEvent && (
                isGoogleEvent ? (
                  <svg width={16} height={16} viewBox="0 0 24 24" className="flex-shrink-0">
                    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.591 4.418 1.582l3.491-3.49A11.932 11.932 0 0 0 12 0C7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z" />
                    <path fill="#34A853" d="M16.041 18.013A7.072 7.072 0 0 1 12 19.09c-2.973 0-5.535-1.853-6.6-4.487l-4.04 3.066C3.193 21.294 7.265 24 12 24c2.933 0 5.735-1.043 7.834-3.001l-3.793-2.986z" />
                    <path fill="#4A90E2" d="M19.834 20.999C22.029 18.952 23.455 15.904 23.455 12c0-.71-.091-1.418-.273-2.09H12v4.545h6.436a5.463 5.463 0 0 1-1.638 2.902l3.036 2.642z" />
                    <path fill="#FBBC05" d="M5.4 14.603A7.15 7.15 0 0 1 4.909 12c0-.56.076-1.104.214-1.624L1.24 7.26A11.981 11.981 0 0 0 0 12c0 1.92.444 3.73 1.237 5.335L5.4 14.603z" />
                  </svg>
                ) : (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="#0078D4" className="flex-shrink-0">
                    <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.32.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12z"/>
                  </svg>
                )
              )}
              {isGoogleEvent
                ? 'Google Calendar Event'
                : provider === 'microsoft'
                  ? 'Outlook Event'
                  : activeEvent
                    ? 'Edit Event'
                    : 'Add Event'}
            </DialogTitle>
            {!activeEvent && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSmartOpen((o) => !o)}
                aria-label="AI quick-parse"
                className={smartOpen ? "text-primary bg-primary/10" : ""}
              >
                <SparkIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
          {isExternalEvent && (
            <p className="text-xs text-muted-foreground mt-1">
              This event is synced from {isGoogleEvent ? 'Google Calendar' : 'Outlook'} and cannot be edited in Lumina.
            </p>
          )}
        </DialogHeader>

        {/* AI parse strip */}
        {smartOpen && !activeEvent && (
          <div className="flex gap-2 px-6 py-3 border-b bg-muted/30">
            <Input
              autoFocus
              placeholder="e.g. 'Team standup at 9am'"
              value={smartInput}
              onChange={(e) => setSmartInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSmartParse()}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              onClick={handleSmartParse}
              disabled={isSmartLoading}
              className="h-8 px-3 shrink-0"
            >
              {isSmartLoading ? "…" : "Parse"}
            </Button>
          </div>
        )}

        {/* Form */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[65vh]">

          {/* Event Name */}
          <div className="space-y-1.5">
            <Label htmlFor="evt-title">Event Name</Label>
            <Input
              id="evt-title"
              autoFocus={!smartOpen}
              placeholder="Enter event name"
              value={formData.title || ""}
              onChange={(e) => { setFormData({ ...formData, title: e.target.value }); setErrors((p) => ({ ...p, title: "" })); }}
              className={errors.title ? "border-destructive focus-visible:ring-destructive/40" : ""}
              disabled={isExternalEvent}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="evt-desc">Description</Label>
            <Textarea
              id="evt-desc"
              placeholder="Enter event description"
              rows={3}
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={isExternalEvent}
            />
          </div>

          {isExternalEvent && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Synced Source</span>
                <span className="text-xs font-semibold text-foreground">{isGoogleEvent ? 'Google Calendar' : 'Outlook Calendar'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Calendar Color</span>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: externalColor }} />
                  {externalColor}
                </span>
              </div>
            </div>
          )}

          {/* External provider details */}
          {isExternalEvent && activeEvent?.organizer && (
            <div className="space-y-1.5">
              <Label>Organizer</Label>
              <p className="text-sm text-muted-foreground">{activeEvent.organizer}</p>
            </div>
          )}
          {isExternalEvent && activeEvent?.location && (
            <div className="space-y-1.5">
              <Label>Location</Label>
              <p className="text-sm text-muted-foreground">{activeEvent.location}</p>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <DatePicker
                value={formData.date || ""}
                onChange={(date) => { setFormData({ ...formData, date }); setErrors((p) => ({ ...p, date: "" })); }}
                disabled={isExternalEvent}
              />
              {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <DatePicker
                value={formData.date || ""}
                onChange={(date) => setFormData({ ...formData, date })}
                disabled={isExternalEvent}
              />
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <TimePicker
                value={formData.startTime || "09:00"}
                onChange={(v) => setFormData({ ...formData, startTime: v })}
                disabled={isExternalEvent}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <TimePicker
                value={formData.endTime || "10:00"}
                onChange={(v) => { setFormData({ ...formData, endTime: v }); setErrors((p) => ({ ...p, endTime: "" })); }}
                disabled={isExternalEvent}
              />
              {errors.endTime && <p className="text-xs text-destructive col-span-2">{errors.endTime}</p>}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={formData.category || "Work"}
              onValueChange={(v) => setFormData({ ...formData, category: v as EventCategory })}
              disabled={isExternalEvent}
            >
              <SelectTrigger className="h-9">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORIES.find((c) => c.name === formData.category)?.color || "#6D59E0" }}
                    />
                    {formData.category}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.name} value={cat.name}>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t flex-row items-center justify-between">
          <div>
            {localEvent && !isExternalEvent && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { deleteEvent(localEvent.id); closeModal(); }}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <TrashIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={closeModal}>
              {isExternalEvent ? "Close" : "Cancel"}
            </Button>
            {!isExternalEvent && (
              <Button size="sm" onClick={handleSave} className="bg-primary hover:bg-primary/90 gap-1.5">
                {localEvent ? "Save changes" : "Save"}
              </Button>
            )}
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};

export default EventModal;
