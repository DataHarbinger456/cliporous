/**
 * Funnel — 3-5 stacked stages that narrow downward (sales funnel, audience →
 * customers, hierarchy / pyramid).
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. Each
 * stage is a centered rounded bar whose width is interpolated from its `value`
 * by the frame clock (rather than a CSS transition, which is inert in a
 * rendered frame). Stages stagger in, growing + fading. Each stage's fill is
 * derived from the accent at a stepped alpha so it stays palette-safe.
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { FunnelProps } from './types';

/** Two-digit hex alpha suffix (00-ff) for an 0-1 alpha. */
function alphaHex(a: number): string {
  const v = Math.round(Math.min(1, Math.max(0, a)) * 255);
  return v.toString(16).padStart(2, '0');
}

export const Funnel: React.FC<FunnelProps> = ({
  skinId,
  kicker,
  heading,
  stages,
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

  // Keep the stack legible regardless of count (3-5): shrink the row height as
  // more stages are added so the whole funnel fits the surface.
  const count = Math.max(1, stages.length);
  const stageHeight = count >= 5 ? 92 : count === 4 ? 104 : 118;

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
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              marginTop: 56,
            }}
          >
            {stages.map((stage, i) => {
              const grow = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 },
              });
              // value drives the stage width; clamp to a floor so labels fit.
              const value = Math.max(0, Math.min(1, stage.value));
              const targetPct = Math.max(0.34, value);
              const widthPx = cw * targetPct * grow;
              // Stepped alpha deepens the accent as the funnel narrows; floored
              // so the last stage stays visible. Palette-safe (accent only).
              const fill = `${accent}${alphaHex(0.95 - i * 0.16)}`;
              const innerW = Math.max(0, widthPx - 64);
              return (
                <div
                  key={i}
                  style={{
                    width: widthPx,
                    height: stageHeight,
                    opacity: grow,
                    transform: `translateY(${interpolate(grow, [0, 1], [-18, 0])}px)`,
                    background: fill,
                    border: `1px solid ${accent}`,
                    borderRadius: 16,
                    boxShadow: `0 0 28px ${accent}33`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 32px',
                    overflow: 'hidden',
                  }}
                >
                  <FitText
                    maxWidth={innerW * 0.62}
                    maxFontSize={34}
                    minFontSize={20}
                    maxLines={1}
                    charWidthRatio={CHAR_WIDTH_RATIO.geist}
                    style={{ fontFamily: 'Geist', fontWeight: 700, color: pal.background }}
                  >
                    {stage.label}
                  </FitText>
                  <FitText
                    maxWidth={innerW * 0.36}
                    maxFontSize={40}
                    minFontSize={24}
                    maxLines={1}
                    charWidthRatio={CHAR_WIDTH_RATIO.bebas}
                    style={{
                      flexShrink: 0,
                      marginLeft: 20,
                      textAlign: 'right',
                      fontFamily: 'Bebas Neue',
                      color: pal.background,
                    }}
                  >
                    {stage.valueLabel}
                  </FitText>
                </div>
              );
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
