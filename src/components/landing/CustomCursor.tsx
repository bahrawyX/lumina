"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Site-wide custom cursor.
 *
 * - Always visible on pointer (non-touch) devices across the entire app.
 * - Shows a default "Lumina" label with the theme's primary color when not
 *   in any cursor zone.
 * - When the mouse enters a `<CursorZone>` with `data-cursor-label` /
 *   `data-cursor-color`, the label + pill color swap to that zone's values.
 * - Hides over text inputs/textareas so the native text caret is usable.
 * - No-op on touch devices.
 *
 * The cursor reads the currently-applied `--primary` CSS variable at runtime
 * so the pill always matches the live theme (light/dark). Zones override the
 * color with their own hex for section accent signaling.
 */

const DEFAULT_LABEL = "Lumina";
// Sentinel — means "use live theme --primary". Actual color is read at render time.
const THEME_PRIMARY = "__theme_primary__";

/**
 * Pick a readable foreground color for a given background.
 * Accepts `#rrggbb`, `#rgb`, or `hsl(...)` / `hsla(...)`.
 * Falls back to dark text if we can't parse.
 */
function readableTextOn(bg: string): string {
  const ctx = readableTextOn as unknown as { cache?: Map<string, string> };
  if (!ctx.cache) ctx.cache = new Map();
  const cached = ctx.cache.get(bg);
  if (cached) return cached;

  let r = 0, g = 0, b = 0;
  let ok = false;

  if (bg.startsWith("#")) {
    let hex = bg.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      ok = true;
    }
  } else if (bg.startsWith("hsl")) {
    const m = /hsla?\(\s*([-\d.]+)\s*,?\s*([-\d.]+)%\s*,?\s*([-\d.]+)%/.exec(bg);
    if (m) {
      const h = parseFloat(m[1]!) / 360;
      const s = parseFloat(m[2]!) / 100;
      const l = parseFloat(m[3]!) / 100;
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      let rf, gf, bf;
      if (s === 0) rf = gf = bf = l;
      else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        rf = hue2rgb(p, q, h + 1 / 3);
        gf = hue2rgb(p, q, h);
        bf = hue2rgb(p, q, h - 1 / 3);
      }
      r = Math.round(rf * 255);
      g = Math.round(gf * 255);
      b = Math.round(bf * 255);
      ok = true;
    }
  }

  if (!ok) {
    ctx.cache.set(bg, "#131313");
    return "#131313";
  }

  // Relative luminance (WCAG)
  const lum =
    0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  const fg = lum > 0.55 ? "#131313" : "#ffffff";
  ctx.cache.set(bg, fg);
  return fg;
}

/** Read the current theme's --primary as an HSL string. */
function resolveThemePrimary(): string {
  if (typeof window === "undefined") return "hsl(249, 66%, 61%)";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary")
    .trim();
  // --primary is stored as "H S% L%" (three space-separated values)
  return raw ? `hsl(${raw})` : "hsl(249, 66%, 61%)";
}

/**
 * Does this element sit inside something the user can click?
 *
 * F1.4: suppressing the native cursor removed the pointer hand from every
 * control, and the replacement cursor had NO hover state — so on a marketing
 * page whose only job is to get a click, nothing at cursor level said anything
 * was clickable.
 *
 * Exported because the render loop runs inside `requestAnimationFrame`, which
 * is throttled in a headless browser — this is the part worth testing, and it
 * is testable only if it is reachable.
 */
export function isInteractiveTarget(el: Element | null): boolean {
  if (!el) return false;
  return (
    el.closest('a[href], button, [role="button"], [role="tab"], summary, label[for], select') !==
    null
  );
}

export function CustomCursor() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [color, setColor] = useState<string>(THEME_PRIMARY);
  const [resolvedPrimary, setResolvedPrimary] = useState<string>(
    "hsl(249, 66%, 61%)",
  );

  // Re-resolve --primary when the theme class flips on <html>
  useEffect(() => {
    const update = () => setResolvedPrimary(resolveThemePrimary());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Touch device — never render
    if (window.matchMedia("(pointer: coarse)").matches) {
      wrap.style.display = "none";
      return;
    }

    // F1.4: there was no reduced-motion check here at all, while SmoothScroll,
    // LottieAnimation, CountUp and BlurText all had one. A RAF-driven trailing
    // cursor is a classic vestibular trigger — and hiding the native cursor
    // also defeats the OS's own cursor-size and high-contrast-cursor settings,
    // which are the accessibility tools these users rely on.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      wrap.style.display = "none";
      return;
    }

    // Hide the native cursor globally via a scoped style tag. We use the
    // `data-lumina-cursor` attribute on <html> so tests / opting-out pages
    // can disable it by removing the attribute.
    document.documentElement.setAttribute("data-lumina-cursor", "on");
    const style = document.createElement("style");
    style.setAttribute("data-lumina-cursor-style", "");
    style.textContent = `
      html[data-lumina-cursor="on"],
      html[data-lumina-cursor="on"] body,
      html[data-lumina-cursor="on"] *:not(input):not(textarea):not([contenteditable="true"]) {
        cursor: none !important;
      }
      html[data-lumina-cursor="on"] input,
      html[data-lumina-cursor="on"] textarea,
      html[data-lumina-cursor="on"] [contenteditable="true"] {
        cursor: text !important;
      }
    `;
    document.head.appendChild(style);

    let mouseX = 0;
    let mouseY = 0;
    let lastTarget: EventTarget | null = null;
    let rafScheduled = false;

    const isTextyInput = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      if (el instanceof HTMLInputElement) {
        const t = el.type;
        return (
          t === "text" ||
          t === "email" ||
          t === "password" ||
          t === "search" ||
          t === "url" ||
          t === "number" ||
          t === "tel"
        );
      }
      return el instanceof HTMLTextAreaElement;
    };

    const hide = () => {
      wrap.style.opacity = "0";
    };
    const show = () => {
      wrap.style.opacity = "1";
    };

    const render = () => {
      rafScheduled = false;
      wrap.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;

      // Hide over text inputs so the caret is readable
      if (isTextyInput(lastTarget)) {
        hide();
        return;
      }

      const el = lastTarget instanceof HTMLElement ? lastTarget : null;

      // F1.4: the replacement cursor was a single static arrow with NO hover
      // state anywhere in the component — so "Get started free", "Sign in", the
      // theme toggle and the six carousel dots all lost the pointer hand, and a
      // visitor had no cursor-level signal that anything was clickable. On a
      // marketing page whose only job is to get a click, that is a direct
      // conversion cost.
      wrap.dataset.interactive = isInteractiveTarget(el) ? "true" : "false";

      const zone = el?.closest<HTMLElement>("[data-cursor-label]") ?? null;
      const zoneLabel = zone?.dataset.cursorLabel;
      const zoneColor = zone?.dataset.cursorColor;

      if (zone && zoneLabel) {
        setLabel(zoneLabel);
        setColor(zoneColor || THEME_PRIMARY);
      } else {
        setLabel(DEFAULT_LABEL);
        setColor(THEME_PRIMARY);
      }
      show();
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      lastTarget = e.target;
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(render);
      }
    };

    const onMouseLeave = () => hide();
    const onMouseEnter = () => show();

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    // F1.4: the style hiding the native cursor was installed synchronously, but
    // the replacement started at `opacity: 0` and was only shown from inside
    // `render()`, which only ran on the first `mousemove`. Load the page and
    // don't move the mouse: there was no cursor at all. Park it centre-screen
    // and show it now; the first real move corrects the position.
    mouseX = window.innerWidth / 2;
    mouseY = window.innerHeight / 2;
    render();

    // F1.4: cleanup ran on unmount ONLY. A hard navigation, or an error
    // boundary firing between mount and unmount, left `data-lumina-cursor="on"`
    // on <html> for the life of the document — no cursor, and no recovery but a
    // reload. `pagehide` covers the bfcache and hard-navigation cases that
    // React unmount does not.
    const restoreNativeCursor = () => {
      document.documentElement.removeAttribute("data-lumina-cursor");
    };
    window.addEventListener("pagehide", restoreNativeCursor);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
      window.removeEventListener("pagehide", restoreNativeCursor);
      restoreNativeCursor();
      style.remove();
    };
  }, []);

  // Resolve the effective background color for the pill + pick a readable fg
  const pillBg = color === THEME_PRIMARY ? resolvedPrimary : color;
  const pillFg = readableTextOn(pillBg);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform",
        opacity: 0,
        transition: "opacity 120ms ease-out",
      }}
      // Scaled up over anything clickable — the cursor-level "this is a
      // control" signal that replaces the pointer hand we suppressed.
      className="lumina-cursor"
    >
      {/* Triangular arrow cursor with notch */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
          transform: "rotate(-6deg)",
        }}
      >
        <path
          d="M155 60 L440 290 C460 306 455 338 430 342 L310 342 C288 342 268 352 254 370 L190 452 C174 472 142 462 140 438 L120 95 C119 68 138 48 155 60 Z"
          fill="white"
          stroke="#0a0a0a"
          strokeWidth="32"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 18,
          top: 18,
          background: pillBg,
          color: pillFg,
          fontFamily: "'Geist Mono', 'Space Grotesk', ui-monospace, monospace",
          fontSize: 9,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 3,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          lineHeight: 1.2,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          transition: "background 200ms ease-out, color 200ms ease-out",
        }}
      >
        {label}
      </div>
    </div>
  );
}
