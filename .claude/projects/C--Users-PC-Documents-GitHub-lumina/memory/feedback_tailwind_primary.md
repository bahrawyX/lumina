---
name: Tailwind Primary Foreground Fix
description: tailwind.config.js primary color must include foreground key pointing to CSS var
type: feedback
---

Tailwind config has hardcoded `primary: '#6D59E0'` AND CSS variable-based colors. The `primary.foreground` must point to `hsl(var(--primary-foreground))`.

**Why:** Missing foreground key caused invisible/dark text on all `bg-primary` buttons in light mode (Pomodoro pills, Start/Pause, auth submit, onboarding buttons).

**How to apply:** When touching tailwind.config.js color definitions, always ensure compound color objects have both the DEFAULT and foreground keys.
