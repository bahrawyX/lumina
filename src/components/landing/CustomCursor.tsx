"use client";

import { useEffect, useRef } from "react";

export function CustomCursor() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Touch device — don't render the custom cursor at all
    if (window.matchMedia("(pointer: coarse)").matches) {
      wrap.style.display = "none";
      return;
    }

    // Hide the default cursor globally. The `* { cursor: none !important }`
    // stylesheet is what fixes the real-cursor leaking through on buttons/
    // links that set their own `cursor-pointer` — !important beats the
    // Tailwind util. We tear both down in cleanup so the calendar app gets
    // its normal cursor back on navigation.
    document.documentElement.style.cursor = "none";
    const style = document.createElement("style");
    style.textContent = "* { cursor: none !important; }";
    document.head.appendChild(style);

    // Elements that need their native cursor (resize handles, text inputs)
    const NATIVE_CURSOR_CHECK = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.classList.contains("cf-panel")) return true;
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        if (target.type === "text" || target.type === "email" || target.tagName === "TEXTAREA") {
          return true;
        }
      }
      return false;
    };

    let pressed = false;
    // RAF-throttled state — writing transform on every mousemove (120+ Hz
    // on gaming mice) is wasteful. Batching into one RAF per frame is the
    // standard cursor-follower perf fix.
    let mouseX = 0;
    let mouseY = 0;
    let lastTarget: EventTarget | null = null;
    let rafScheduled = false;

    const show = () => {
      wrap.style.opacity = "1";
      wrap.style.visibility = "visible";
    };
    const hide = () => {
      wrap.style.opacity = "0";
      wrap.style.visibility = "hidden";
    };

    const render = () => {
      rafScheduled = false;
      wrap.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;

      const needsNative =
        NATIVE_CURSOR_CHECK(lastTarget) ||
        pressed ||
        document.body.classList.contains("d20-dragging");

      if (needsNative) {
        hide();
        document.documentElement.style.cursor = "auto";
      } else {
        show();
        document.documentElement.style.cursor = "none";
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

    const onMouseDown = (e: MouseEvent) => {
      pressed = true;
      if (NATIVE_CURSOR_CHECK(e.target)) {
        hide();
        document.documentElement.style.cursor = "auto";
      }
    };

    const onMouseUp = () => {
      pressed = false;
      // Next mousemove decides visibility — don't force-show here
    };

    // D20 (dnd-kit drag) class observer — hide immediately on drag start
    const updateD20Visibility = () => {
      if (document.body.classList.contains("d20-dragging")) {
        hide();
      }
    };
    const classObserver = new MutationObserver(updateD20Visibility);
    classObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const onLeave = () => hide();
    const onEnter = () => show();

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      classObserver.disconnect();
      document.documentElement.style.cursor = "";
      style.remove();
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
          filter:
            "drop-shadow(0 0 8px rgba(206,241,54,0.35)) drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
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
          background: "#cef136",
          color: "#131313",
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: 9,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 3,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 0 10px rgba(206,241,54,0.2)",
          lineHeight: 1.2,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        You
      </div>
    </div>
  );
}
