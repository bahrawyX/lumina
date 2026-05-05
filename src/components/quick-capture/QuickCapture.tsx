'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuickCaptureStore } from '@/store/useQuickCaptureStore';
import { classify, parseEventDetails, type CaptureType } from './classifier';
import { useQuickCaptureActions } from './useQuickCaptureActions';
import { QuickCaptureInput } from './QuickCaptureInput';
import { QuickCaptureTypePills } from './QuickCaptureTypePills';
import { QuickCaptureContext } from './QuickCaptureContext';
import { QuickCaptureFooter } from './QuickCaptureFooter';

const TYPE_ORDER: CaptureType[] = ['task', 'doc', 'event'];

export function QuickCapture() {
  // Standard "portal-mount after hydration" pattern: server renders nothing,
  // client flips to true after first paint so createPortal is only called
  // when document.body actually exists.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isOpen = useQuickCaptureStore((s) => s.isOpen);
  const close = useQuickCaptureStore((s) => s.close);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && <QuickCaptureModal onClose={close} />}
    </AnimatePresence>,
    document.body,
  );
}

// ── Inner modal ───────────────────────────────────────────────────────────
// Lives only while open — unmounting on close gives us free state reset.

function QuickCaptureModal({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { createTask, createDoc, createEvent } = useQuickCaptureActions();

  const [inputValue, setInputValue] = useState('');
  const [type, setType] = useState<CaptureType>('task');
  const [userOverrode, setUserOverrode] = useState(false);

  // Task fields
  const [taskDueDate, setTaskDueDate] = useState<Date | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);

  // Event fields
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [eventTime, setEventTime] = useState<string>('09:00');
  const [eventDuration, setEventDuration] = useState<number>(60);

  // ── Auto-classify + parse on every keystroke ────────────────────────────
  useEffect(() => {
    if (userOverrode) return;
    const detected = classify(inputValue);
    if (detected !== type) setType(detected);
  }, [inputValue, userOverrode, type]);

  // When the input parses to an event, pre-fill date/time pickers if the
  // user hasn't manually set them yet.
  useEffect(() => {
    if (type !== 'event') return;
    const parsed = parseEventDetails(inputValue);
    if (parsed.suggestedDate && !eventDate) setEventDate(parsed.suggestedDate);
    if (parsed.suggestedTime && eventTime === '09:00') setEventTime(parsed.suggestedTime);
    // eventDate / eventTime intentionally omitted — we only want to suggest
    // once, not fight the user every keystroke after they pick a date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, type]);

  // ── Submit gate ─────────────────────────────────────────────────────────
  const trimmed = inputValue.trim();
  const hasInput = trimmed.length > 0;
  const hasDate = type === 'event' ? eventDate !== null : taskDueDate !== null;
  const canSubmit =
    hasInput && (type !== 'event' || eventDate !== null);

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (type === 'task') {
      createTask(trimmed, taskDueDate, goalId);
      return;
    }
    if (type === 'doc') {
      void createDoc(trimmed);
      return;
    }
    if (type === 'event' && eventDate) {
      const [hh, mm] = eventTime.split(':').map((n) => parseInt(n, 10));
      const start = new Date(eventDate);
      start.setHours(
        Number.isFinite(hh) ? hh : 9,
        Number.isFinite(mm) ? mm : 0,
        0,
        0,
      );
      // For event creation, prefer the parsed event title (which strips
      // "tomorrow at 3pm" etc) over the raw input — but only if we got a
      // non-empty title back, otherwise fall back to the raw text.
      const parsed = parseEventDetails(inputValue);
      const finalTitle = parsed.title.trim() || trimmed;
      createEvent(finalTitle, start, eventDuration);
    }
  };

  // ── Modal-scoped keyboard handlers ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        // Don't override a textarea Enter — but our only typing surface is a
        // single-line <input>, where Enter is "submit form" anyway.
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const idx = TYPE_ORDER.indexOf(type);
        const next = TYPE_ORDER[(idx + 1) % TYPE_ORDER.length];
        setType(next);
        setUserOverrode(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        const i = parseInt(e.key, 10) - 1;
        const target = TYPE_ORDER[i];
        if (target) {
          setType(target);
          setUserOverrode(true);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // handleSubmit is recreated each render but that's fine — the closure
    // it captures is the up-to-date one. Including it in deps would cause
    // a re-bind on every keystroke for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, canSubmit, inputValue, eventDate, eventTime, eventDuration, taskDueDate]);

  // ── Pill click ──────────────────────────────────────────────────────────
  const handleSelectType = (next: CaptureType) => {
    setType(next);
    setUserOverrode(true);
  };

  // ── Refocus the input after popovers close ──────────────────────────────
  // The Radix popover steals focus while open; on close we want it back in
  // the input so the user can keep typing.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Memoize the icon column color so the type-icon transition isn't
  // recomputed on every keystroke.
  const memoType = useMemo(() => type, [type]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="qc-backdrop"
        className="qc-backdrop fixed inset-0 z-[80] bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="fixed inset-0 z-[81] flex items-start justify-center pt-[20vh] pointer-events-none">
        <motion.div
          key="qc-card"
          role="dialog"
          aria-label="Quick Capture"
          aria-modal="true"
          className="pointer-events-auto bg-popover text-popover-foreground rounded-2xl border border-border/60 shadow-2xl shadow-black/20 max-w-lg w-full mx-4 px-5 py-4"
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <QuickCaptureInput
            ref={inputRef}
            type={memoType}
            value={inputValue}
            onChange={setInputValue}
          />

          <div className="pt-3">
            <QuickCaptureTypePills active={memoType} onSelect={handleSelectType} />
          </div>

          <QuickCaptureContext
            type={memoType}
            taskDueDate={taskDueDate}
            setTaskDueDate={setTaskDueDate}
            eventDate={eventDate}
            setEventDate={setEventDate}
            eventTime={eventTime}
            setEventTime={setEventTime}
            eventDuration={eventDuration}
            setEventDuration={setEventDuration}
            goalId={goalId}
            setGoalId={setGoalId}
          />

          <QuickCaptureFooter
            type={memoType}
            hasInput={hasInput}
            hasDate={hasDate}
            canSubmit={canSubmit}
            onSubmit={handleSubmit}
          />
        </motion.div>
      </div>
    </>
  );
}
