"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Zone-aware custom cursor.
 *
 * Unlike a global "sticky" cursor that hijacks the entire page, this one
 * only shows up inside `<CursorZone>` regions — each zone declares a label
 * and color via `data-cursor-label` / `data-cursor-color` attributes.
 *
 * Behavior:
 *   - Native cursor is visible everywhere by default.
 *   - When the mouse enters a CursorZone: native cursor hides, custom
 *     cursor appears with that zone's label/color.
 *   - When the mouse leaves the zone (or hovers a text input inside a zone):
 *     native cursor returns.
 *
 * The scoped `cursor: none` is applied only to the zone element itself via
 * inline style, not via a global `<style>` tag — leaving the rest of the
 * landing page (nav, footer, empty space) with the normal cursor.
 */
export function CustomCursor() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState("You");
  const [color, setColor] = useState("#cef136");

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Touch device — never render
    if (window.matchMedia("(pointer: coarse)").matches) {
      wrap.style.display = "none";
      return;
    }

    // Which zone element is currently hiding its native cursor — we track
    // this so we can restore it when leaving.
    let activeZone: HTMLElement | null = null;

    const isTextyInput = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el instanceof HTMLInputElement) {
        const t = el.type;
        return t === "text" || t === "email" || t === "password" || t === "search" || t === "url";
      }
      return el instanceof HTMLTextAreaElement;
    };

    // RAF throttling
    let mouseX = 0;
    let mouseY = 0;
    let lastTarget: EventTarget | null = null;
    let rafScheduled = false;

    const hide = () => {
      wrap.style.opacity = "0";
      wrap.style.visibility = "hidden";
    };
    const show = () => {
      wrap.style.opacity = "1";
      wrap.style.visibility = "visible";
    };

    const render = () => {
      rafScheduled = false;
      wrap.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;

      // Find the nearest ancestor declaring itself a cursor zone
      const el = lastTarget instanceof HTMLElement ? lastTarget : null;
      const zone = el?.closest<HTMLElement>("[data-cursor-label]") ?? null;
      const zoneLabel = zone?.dataset.cursorLabel ?? "";
      const zoneColor = zone?.dataset.cursorColor ?? "#cef136";

      // Restore native cursor on the previous zone if we've moved away
      if (activeZone && activeZone !== zone) {
        activeZone.style.cursor = "";
        activeZone = null;
      }

      if (zone && zoneLabel && !isTextyInput(lastTarget)) {
        // Enter a zone (or move within one): hide native cursor on it and show ours
        if (activeZone !== zone) {
          zone.style.cursor = "none";
          activeZone = zone;
        }
        setLabel(zoneLabel);
        setColor(zoneColor);
        show();
      } else {
        // Outside all zones — native cursor is visible, ours is hidden
        hide();
      }
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

    const onMouseLeave = () => {
      hide();
      if (activeZone) {
        activeZone.style.cursor = "";
        activeZone = null;
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      if (activeZone) {
        activeZone.style.cursor = "";
        activeZone = null;
      }
    };
  }, []);

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
        visibility: "hidden",
        transition: "opacity 120ms ease-out",
      }}
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
          background: color,
          color: "#131313",
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
          transition: "background 200ms ease-out",
        }}
      >
        {label}
      </div>
    </div>
  );
}
