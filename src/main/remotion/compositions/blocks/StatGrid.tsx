/**
 * StatGrid — four headline numbers laid out 2×2.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) for its look so
 * the same block renders in every skin. All motion is frame-clock driven.
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { StatGridProps } from './types';

export const StatGrid: React.FC<StatGridProps> = ({
  skinId,
  kicker,
  heading,
  stats,
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
  // 2-col grid (gap 28), each tile padded 48px each side.
  const tileText = Math.round((cw - 28) / 2) - 96;

  return (
    <AbsoluteFill
      style={{ backgroundColor: pal.background, justifyContent: 'center', alignItems: 'center' }}
    >
      <PrestyjFonts />
      <skin.Background accent={accent} bg={pal.background} fg={pal.foreground} />
      <div
        style={{
          ...motion,
        }}
      >
        <skin.Surface accent={accent} bg={pal.background} fg={pal.foreground}>
          <Kicker accent={accent} maxWidth={cw}>
            {kicker}
          </Kicker>
          <Heading fg={pal.foreground} maxWidth={cw}>
            {heading}
          </Heading>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 28,
              marginTop: 60,
            }}
          >
            {stats.slice(0, 4).map((stat, i) => {
              const e = spring({
                frame: frame - 16 - i * 6,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 },
              });
              return (
                <div
                  key={i}
                  style={{
                    padding: '44px 48px',
                    borderRadius: 24,
                    background: `linear-gradient(160deg, ${accent}1f 0%, ${pal.foreground}08 100%)`,
                    border: `1px solid ${accent}33`,
                    boxShadow: `inset 0 1px 0 ${pal.foreground}1a`,
                    opacity: e,
                    transform: `translateY(${interpolate(e, [0, 1], [30, 0])}px) scale(${interpolate(
                      e,
                      [0, 1],
                      [0.94, 1],
                    )})`,
                  }}
                >
                  <FitText
                    maxWidth={tileText}
                    maxFontSize={128}
                    minFontSize={64}
                    maxLines={1}
                    charWidthRatio={CHAR_WIDTH_RATIO.bebas}
                    style={{
                      fontFamily: 'Bebas Neue',
                      lineHeight: 0.9,
                      color: accent,
                      textShadow: `0 0 36px ${accent}40`,
                    }}
                  >
                    {stat.value}
                  </FitText>
                  <FitText
                    maxWidth={tileText}
                    maxFontSize={30}
                    minFontSize={20}
                    maxLines={2}
                    charWidthRatio={CHAR_WIDTH_RATIO.geist}
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 700,
                      lineHeight: 1.15,
                      color: `${pal.foreground}cc`,
                      marginTop: 14,
                    }}
                  >
                    {stat.label}
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
