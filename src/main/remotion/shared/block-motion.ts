/**
 * useBlockMotion — the shared enter/exit container motion for every content
 * block.
 *
 * Blocks replace the speaker for a few seconds and previously sprang IN but
 * hard-cut OUT, which read as cheap. This hook gives every block an identical,
 * frame-clock-driven entrance + exit so they all feel deliberate:
 *
 *   1. Entrance — spring fade + translateY up (damping 20 / stiffness 90),
 *      matching the long-standing `cardIn` feel.
 *   2. Exit — fade out + slight translateY up and scale down over the final
 *      frames before the cut, timed off `useVideoConfig().durationInFrames`.
 *
 * All motion runs through useCurrentFrame()/useVideoConfig() so it renders
 * correctly in Remotion (CSS transitions are inert in a rendered frame).
 *
 * Apply the returned `{ opacity, transform }` to the block's outer wrapper —
 * keep each block's internal staggered element animations untouched.
 */
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { EASE } from './easing';

/** Container style produced by {@link useBlockMotion}. */
export interface BlockMotion {
  opacity: number;
  transform: string;
}

/** Frames over which the block eases out before the cut. */
const EXIT_FRAMES = 10;

export function useBlockMotion(): BlockMotion {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Entrance: spring fade + rise (matches the original hand-rolled `cardIn`).
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } });
  const enterY = interpolate(enter, [0, 1], [50, 0]);

  // Exit: ramp 0 → 1 across the final EXIT_FRAMES (clamped for short blocks).
  const exitFrames = Math.min(EXIT_FRAMES, Math.max(1, durationInFrames - 1));
  const exitStart = durationInFrames - exitFrames;
  const exit = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.inExpo,
  });
  const exitY = interpolate(exit, [0, 1], [0, -28]);
  const exitScale = interpolate(exit, [0, 1], [1, 0.96]);

  return {
    opacity: enter * (1 - exit),
    transform: `translateY(${enterY + exitY}px) scale(${exitScale})`,
  };
}
