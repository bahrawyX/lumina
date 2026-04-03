"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MOOD_ICONS } from "@/components/ui/AnimatedIcons";

type Mood = "great" | "good" | "okay" | "tired" | "bad";

interface PomodoroFeedbackModalProps {
  open: boolean;
  onSubmit: (mood: Mood, note?: string) => void;
}

const MOOD_OPTIONS: { value: Mood; label: string }[] = [
  { value: "great", label: "Amazing" },
  { value: "good", label: "Good" },
  { value: "okay", label: "Okay" },
  { value: "tired", label: "Tired" },
  { value: "bad", label: "Rough" },
];

const NOTE_MAX = 140;

function PomodoroFeedbackModal({ open, onSubmit }: PomodoroFeedbackModalProps) {
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [note, setNote] = useState("");

  const handleSubmit = () => {
    if (!selectedMood) return;
    onSubmit(selectedMood, note.trim() || undefined);
    setSelectedMood(null);
    setNote("");
  };

  const selectedLabel = MOOD_OPTIONS.find(
    (m) => m.value === selectedMood
  )?.label.toLowerCase();

  return (
    <Dialog open={open}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="[&>button:last-child]:hidden bg-card border-border sm:max-w-md"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex flex-col gap-5"
        >
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              How was that session?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Optional — helps surface trends over time
            </DialogDescription>
          </DialogHeader>

          {/* Mood buttons */}
          <div className="flex flex-wrap justify-center gap-3">
            {MOOD_OPTIONS.map((mood) => {
              const isSelected = selectedMood === mood.value;
              return (
                <motion.button
                  key={mood.value}
                  type="button"
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedMood(mood.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-full border px-4 py-3 transition-colors ${
                    isSelected
                      ? "bg-primary/10 border-primary text-primary scale-110"
                      : "border-border bg-muted/50 text-foreground hover:bg-muted"
                  }`}
                >
                  {(() => {
                    const MoodIcon = MOOD_ICONS[mood.value];
                    return MoodIcon ? <MoodIcon size={28} /> : null;
                  })()}
                  <span className="text-xs font-medium">{mood.label}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Optional note */}
          {selectedMood && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="pomodoro-note"
                className="text-sm text-muted-foreground"
              >
                What made it {selectedLabel}?
              </label>
              <textarea
                id="pomodoro-note"
                value={note}
                onChange={(e) =>
                  setNote(e.target.value.slice(0, NOTE_MAX))
                }
                maxLength={NOTE_MAX}
                rows={1}
                placeholder="Optional note..."
                className="w-full resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-right text-xs text-muted-foreground">
                {note.length} / {NOTE_MAX}
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            disabled={!selectedMood}
            onClick={handleSubmit}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          >
            Done
          </button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

export default PomodoroFeedbackModal;
