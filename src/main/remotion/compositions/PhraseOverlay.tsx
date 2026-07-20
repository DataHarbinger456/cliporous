import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_FG } from '../../edit-styles/shared/brand';
import { EASE } from '../shared/easing';
import { PrestyjFonts } from '../shared/fonts';

/** Default phrase-emphasis fill — warm brand cream (no Hormozi gold). */
const DEFAULT_ACCENT = BRAND_FG;

export type PhraseAnimationType = 'scale-in' | 'pop' | 'rise';

export interface PhraseOverlayProps {
  /** Phrase text — rendered uppercase, large, bold condensed. */
  text: string;
  /** Accent color for the text fill. Defaults to Hormozi yellow. */
  accentColor?: string;
  /** Font size in pixels on the 1080px-tall canvas. Defaults to 150. */
  fontSize?: number;
  /** Entry animation. Defaults to 'scale-in'. */
  animationType?: PhraseAnimationType;
}

const ENTER_FRAMES = 15;

/**
 * Animated phrase-emphasis text composited over the speaker. Transparent
 * background — rendered as ProRes 4444 with alpha so FFmpeg overlays it onto
 * the talking-head footage at the phrase's timestamp.
 */
export const PhraseOverlay: React.FC<PhraseOverlayProps> = ({
  text,
  accentColor = DEFAULT_ACCENT,
  fontSize = 150,
  animationType = 'scale-in',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 140, mass: 0.6 },
  });

  // Exit: quick fade in the final ~0.4s so the phrase clears cleanly.
  const exitStart = durationInFrames - Math.round(fps * 0.4);
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.inExpo,
  });

  let scale = 1;
  let translateY = 0;
  let opacity = enter * exitOpacity;

  if (animationType === 'scale-in') {
    scale = interpolate(enter, [0, 1], [0.7, 1]);
  } else if (animationType === 'pop') {
    scale = interpolate(enter, [0, 1], [0.4, 1]);
  } else if (animationType === 'rise') {
    translateY = interpolate(enter, [0, 1], [60, 0]);
    opacity =
      interpolate(frame, [0, ENTER_FRAMES], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }) * exitOpacity;
  }

  const words = text.toUpperCase().split(/\s+/).filter(Boolean);

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        // Bottom lower-third — sits low over the speaker, filling the bottom
        // ~20% band. No background fill; the frame never goes black.
        justifyContent: 'flex-end',
        paddingBottom: '5%',
        paddingLeft: '4%',
        paddingRight: '4%',
      }}
    >
      <PrestyjFonts />
      <div
        style={{
          transform: `scale(${scale}) translateY(${translateY}px)`,
          opacity,
          textAlign: 'center',
          fontFamily: 'Anton',
          fontWeight: 400,
          fontSize,
          lineHeight: 1.02,
          letterSpacing: '-0.01em',
          color: accentColor,
          // Heavy halo so the phrase stays legible over any footage.
          textShadow:
            '0 6px 24px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.9), 0 2px 0 rgba(0,0,0,0.6)',
          maxWidth: '92%',
        }}
      >
        {words.join(' ')}
      </div>
    </AbsoluteFill>
  );
};
