'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useGuestStore } from '@/store/useGuestStore';
import { authClient } from '@/lib/auth-client';
import {
  getFieldError,
  contactTypeSchema,
  contactSubjectSchema,
  contactMessageSchema,
} from '@/lib/validation';
import type { ContactType } from '@/types';

interface ContactDrawerProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'technical', label: 'Technical Issue' },
  { value: 'feedback', label: 'General Feedback' },
];

export default function ContactDrawer({ open, onClose }: ContactDrawerProps) {
  const { data: session } = authClient.useSession();
  const isGuest = useGuestStore((s) => s.isGuest);

  const [type, setType] = useState<ContactType>('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(session?.user?.email ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validateField = useCallback((field: string, value: string) => {
    let err: string | null = null;
    if (field === 'subject') err = getFieldError(contactSubjectSchema, value);
    if (field === 'message') err = getFieldError(contactMessageSchema, value);
    if (field === 'type') err = getFieldError(contactTypeSchema, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
    return !err;
  }, []);

  const validateAll = (): boolean => {
    const errs: Record<string, string> = {};
    const te = getFieldError(contactTypeSchema, type);
    if (te) errs.type = te;
    const se = getFieldError(contactSubjectSchema, subject);
    if (se) errs.subject = se;
    const me = getFieldError(contactMessageSchema, message);
    if (me) errs.message = me;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = useCallback(async () => {
    setServerError(null);
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          subject: subject.trim(),
          message: message.trim(),
          email: email.trim() || null,
        }),
      });

      if (res.status === 429) {
        setServerError('Please wait a minute before submitting again.');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setServerError(data.error ?? 'Something went wrong.');
        return;
      }

      toast.success('Message sent! We\'ll be in touch.');
      setType('feedback');
      setSubject('');
      setMessage('');
      setErrors({});
      onClose();
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, subject, message, email, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer from right */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border shadow-lg flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <h2 className="text-base font-semibold text-foreground">Contact Us</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {/* Type select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <select
                  value={type}
                  onChange={(e) => { setType(e.target.value as ContactType); validateField('type', e.target.value); }}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border/60 text-sm text-foreground outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); }}
                  onBlur={() => validateField('subject', subject)}
                  maxLength={100}
                  placeholder="Brief summary"
                  className={`w-full px-3 py-2.5 rounded-lg bg-background border text-sm text-foreground outline-none focus:ring-2 transition-colors placeholder:text-muted-foreground/40 ${
                    errors.subject ? 'border-destructive focus:ring-destructive/20' : 'border-border/60 focus:ring-primary/20 focus:border-primary/50'
                  }`}
                />
                {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
              </div>

              {/* Message */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); }}
                  onBlur={() => validateField('message', message)}
                  maxLength={1000}
                  rows={5}
                  placeholder="Describe your feedback in detail..."
                  className={`w-full px-3 py-2.5 rounded-lg bg-background border text-sm text-foreground outline-none focus:ring-2 transition-colors placeholder:text-muted-foreground/40 resize-none ${
                    errors.message ? 'border-destructive focus:ring-destructive/20' : 'border-border/60 focus:ring-primary/20 focus:border-primary/50'
                  }`}
                />
                <div className="flex items-center justify-between">
                  {errors.message ? (
                    <p className="text-xs text-destructive">{errors.message}</p>
                  ) : <span />}
                  <span className="text-[10px] text-muted-foreground/50 tabular-nums">{message.length} / 1000</span>
                </div>
              </div>

              {/* Email */}
              {isGuest ? (
                <p className="text-xs text-muted-foreground/60">Sent as Guest</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 rounded-lg bg-background border border-border/60 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground/40"
                  />
                </div>
              )}

              {/* Server error */}
              {serverError && <p className="text-xs text-destructive">{serverError}</p>}
            </div>

            {/* Submit */}
            <div className="px-5 py-4 border-t border-border/60">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
