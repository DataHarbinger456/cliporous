/**
 * Donut — a proportional ring chart (2-4 slices) with a legend.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. The
 * ring is drawn as overlapping SVG `<circle>` arcs; each slice's arc sweeps in
 * via an interpolated `stroke-dashoffset` driven by the frame clock (CSS
 * transitions are inert in a rendered frame). Slice colors are derived from the
 * accent at descending alpha so the chart stays palette-safe — never a
 * hardcoded rainbow.
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { EASE } from '../../shared/easing';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { DonutProps } from './types';

/** Accent at a descending alpha so each slice reads distinctly, palette-safe. */
function sliceColor(accent: string, index: number, count: number): string {
  const t = count <= 1 ? 0 : index / (count - 1);
  // Full accent on the leading slice → ~0.4 alpha on the last.
  const alpha = 1 - t * 0.58;
  const hex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${accent}${hex}`;
}

export const Donut: React.FC<DonutProps> = ({
  skinId,
  kicker,
  heading,
  slices,
  accentColor,
  palette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const skin = SKINS[skinId];
  const pal: Palette = palette ?? {
    id: 'brand',
    name: 'Brand Default',
    background: BRAND_BG,
    foreground: BRAND_FG,
    accent: BRAND_ACCENT,
    builtin: true,
  };
  const accent = accentColor ?? palette?.accent ?? skin.accent;
  const motion = useBlockMotion();
  const cw = SKIN_CONTENT_WIDTH[skinId];

  // Ring geometry — fixed dimension on the left, legend takes the rest.
  const dimension = 380;
  const stroke = 58;
  const radius = (dimension - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Normalise shares defensively so the ring always closes.
  const data = slices.slice(0, 4).map((s) => ({ ...s, value: Math.max(0, s.value) }));
  const total = data.reduce((sum, s) => sum + s.value, 0);
  const fractions = data.map((s) => (total > 0 ? s.value / total : 1 / Math.max(1, data.length)));

  // Cumulative start fraction for each slice (where its arc begins on the ring).
  let acc = 0;
  const starts = fractions.map((f) => {
    const start = acc;
    acc += f;
    return start;
  });

  const legendWidth = cw - dimension - 64;
  const leadIndex = fractions.reduce((best, f, i) => (f > fractions[best] ? i : best), 0);
  const lead = data[leadIndex];

  // Center fade-in once the arcs have begun sweeping.
  const centerOpacity = interpolate(frame, [22, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{ backgroundColor: pal.background, justifyContent: 'center', alignItems: 'center' }}
    >
      <PrestyjFonts />
      <skin.Background accent={accent} bg={pal.background} fg={pal.foreground} />
      <div style={{ ...motion }}>
        <skin.Surface accent={accent} bg={pal.background} fg={pal.foreground}>
          <Kicker accent={accent} maxWidth={cw}>
            {kicker}
          </Kicker>
          <Heading fg={pal.foreground} maxWidth={cw}>
            {heading}
          </Heading>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 64,
              marginTop: 56,
            }}
          >
            {/* Ring */}
            <div
              style={{ position: 'relative', width: dimension, height: dimension, flexShrink: 0 }}
            >
              <svg width={dimension} height={dimension}>
                {/* Track */}
                <circle
                  cx={dimension / 2}
                  cy={dimension / 2}
                  r={radius}
                  fill="none"
                  stroke={`${pal.foreground}14`}
                  strokeWidth={stroke}
                />
                {data.map((_slice, i) => {
                  const arcLen = fractions[i] * circumference;
                  // Stagger each slice's sweep; reveal by shrinking dashoffset.
                  const p = interpolate(frame, [8 + i * 7, 30 + i * 7], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                    easing: EASE.outExpo,
                  });
                  const dashOffset = arcLen * (1 - p);
                  const rotation = -90 + starts[i] * 360;
                  return (
                    <circle
                      key={i}
                      cx={dimension / 2}
                      cy={dimension / 2}
                      r={radius}
                      fill="none"
                      stroke={sliceColor(accent, i, data.length)}
                      strokeWidth={stroke}
                      strokeDasharray={`${arcLen} ${circumference}`}
                      strokeDashoffset={dashOffset}
                      transform={`rotate(${rotation} ${dimension / 2} ${dimension / 2})`}
                    />
                  );
                })}
              </svg>

              {/* Center — leading slice */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  opacity: centerOpacity,
                }}
              >
                <span
                  style={{
                    fontFamily: 'Bebas Neue',
                    fontSize: 76,
                    lineHeight: 0.9,
                    color: pal.foreground,
                  }}
                >
                  {lead?.valueLabel ?? ''}
                </span>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: 17,
                    letterSpacing: 3,
                    textTransform: 'uppercase',
                    color: `${pal.foreground}99`,
                    marginTop: 8,
                    maxWidth: dimension - stroke * 2,
                    textAlign: 'center',
                  }}
                >
                  {lead?.label ?? ''}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 26 }}>
              {data.map((slice, i) => {
                const e = spring({
                  frame: frame - 18 - i * 6,
                  fps,
                  config: { damping: 18, stiffness: 110, mass: 0.8 },
                });
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 20,
                      opacity: e,
                      transform: `translateX(${interpolate(e, [0, 1], [24, 0])}px)`,
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: sliceColor(accent, i, data.length),
                        boxShadow: `0 0 18px ${accent}44`,
                      }}
                    />
                    <FitText
                      maxWidth={legendWidth - 26 - 20 - 160 - 24}
                      maxFontSize={36}
                      minFontSize={22}
                      maxLines={1}
                      charWidthRatio={CHAR_WIDTH_RATIO.geist}
                      style={{
                        flex: 1,
                        fontFamily: 'Geist',
                        fontWeight: 700,
                        color: pal.foreground,
                      }}
                    >
                      {slice.label}
                    </FitText>
                    <FitText
                      maxWidth={160}
                      maxFontSize={44}
                      minFontSize={28}
                      maxLines={1}
                      charWidthRatio={CHAR_WIDTH_RATIO.bebas}
                      style={{
                        flexShrink: 0,
                        marginLeft: 24,
                        textAlign: 'right',
                        fontFamily: 'Bebas Neue',
                        color: accent,
                        textShadow: `0 0 24px ${accent}40`,
                      }}
                    >
                      {slice.valueLabel}
                    </FitText>
                  </div>
                );
              })}
            </div>
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
