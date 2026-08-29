import { create } from 'zustand';

/**
 * The bottom-right corner, shared between the things that live in it.
 *
 * `InstallPrompt` and the tutorial's floating "?" button are mounted in
 * separate subtrees of `AppShell` and both position themselves `fixed`, so
 * neither can see the other. Previously that was fine only because the install
 * card sat bottom-CENTRE and the "?" sat bottom-right — they missed each other
 * by luck of layout, not by design.
 *
 * With both in the corner, the "?" has to sit above the card while it is there
 * and drop back down when it goes. This store is the smallest thing that lets
 * that happen: the card reports whether it is visible and how tall it actually
 * is, and the button offsets itself by that.
 *
 * The height is measured rather than hardcoded because the card has two
 * different bodies — the standard Chrome/Edge prompt and the taller iOS
 * Share-sheet guide — and a magic number would be right for one of them.
 */
interface BottomRightStack {
  /** True while the install card occupies the corner. */
  installVisible: boolean;
  /** Measured card height in px, including the gap the button should leave. */
  installHeight: number;
  setInstall: (visible: boolean, height: number) => void;
}

export const useBottomRightStack = create<BottomRightStack>((set) => ({
  installVisible: false,
  installHeight: 0,
  setInstall: (installVisible, installHeight) => set({ installVisible, installHeight }),
}));

/** Gap between the card and the button above it. */
export const STACK_GAP_PX = 12;
