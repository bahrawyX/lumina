import React from 'react';
import { motion } from 'framer-motion';
import IconBase, { IconProps } from './IconBase';

/**
 * Undo / redo — deliberately NOT the circular-arrow variant.
 *
 * These used to draw a 9-radius arc sweeping most of a circle:
 *
 *     M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13
 *
 * which is the same shape essentially every application uses for
 * refresh/reload/sync — and it was reported as exactly that: "the reload icon
 * on the calendar". It is the only place in the app these appear, because
 * undo/redo is a calendar-only feature, so it read as a page-specific reload
 * button that did nothing reload-ish when pressed.
 *
 * The hover animation made it worse: `rotate: -15` is spinning motion, which
 * is the other half of how a refresh control announces itself.
 *
 * These are the hook-shaped arrows instead — a long straight lead-in with a
 * tight 180° turn at the end. The eye reads "goes back and returns", not "goes
 * round", and there is no arc long enough to suggest a circle. The hover now
 * nudges along the axis of travel, so the motion reinforces direction rather
 * than rotation.
 */

/** Matches the tooltip and `aria-label` on the calendar toolbar buttons. */
const HOVER_NUDGE = 1.5;

export const UndoIcon: React.FC<IconProps> = (props) => (
    <IconBase {...props} whileHover="hover">
        <motion.g
            variants={{ hover: { x: -HOVER_NUDGE } }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
            {/* Arrowhead, pointing left — the direction of travel. */}
            <path d="M9 14 4 9l5-5" />
            {/* Straight run, then a half-turn back down. */}
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </motion.g>
    </IconBase>
);

export const RedoIcon: React.FC<IconProps> = (props) => (
    <IconBase {...props} whileHover="hover">
        <motion.g
            variants={{ hover: { x: HOVER_NUDGE } }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
            {/* The mirror of Undo, so the pair reads as a direction. */}
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
        </motion.g>
    </IconBase>
);
