/**
 * BarChart — a row of vertical bars that grow from the baseline.
 *
 * A *content block*: it knows nothing about color or surface. It composes a
 * `BlockSkin` (via `skinId`) for its look so the same block renders in every
 * skin. All motion is driven by the frame clock through spring()/interpolate().
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { BarChartProps } from './types';

const CHART_HEIGHT = 380;

export const BarChart: React.FC<BarChartProps> = ({
  skinId,
  kicker,
  heading,
  bars,
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
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 28,
              marginTop: 64,
              height: CHART_HEIGHT,
              borderBottom: `2px solid ${accent}3a`,
              paddingBottom: 0,
            }}
          >
            {bars.map((bar, i) => {
              const grow = spring({
                frame: frame - 16 - i * 6,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 },
              });
              const value = Math.max(0, Math.min(1, bar.value));
              const barHeight = value * (CHART_HEIGHT - 64) * grow;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    height: '100%',
                  }}
                >
                  {/* Value label */}
                  <FitText
                    maxWidth={160}
                    maxFontSize={46}
                    minFontSize={26}
                    maxLines={1}
                    charWidthRatio={CHAR_WIDTH_RATIO.bebas}
                    style={{
                      fontFamily: 'Bebas Neue',
                      lineHeight: 1,
                      color: pal.foreground,
                      marginBottom: 14,
                      textAlign: 'center',
                      opacity: grow,
                      transform: `translateY(${interpolate(grow, [0, 1], [12, 0])}px)`,
                    }}
                  >
                    {bar.valueLabel}
                  </FitText>
                  {/* Bar */}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 132,
                      height: barHeight,
                      borderRadius: '14px 14px 0 0',
                      background: `linear-gradient(180deg, ${accent} 0%, ${accent}aa 100%)`,
                      boxShadow: `0 0 28px ${accent}44, inset 0 1px 0 ${pal.foreground}33`,
                    }}
                  />
                  {/* Category label */}
                  <FitText
                    maxWidth={160}
                    maxFontSize={26}
                    minFontSize={16}
                    maxLines={2}
                    charWidthRatio={CHAR_WIDTH_RATIO.geist}
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 700,
                      color: `${pal.foreground}cc`,
                      marginTop: 20,
                      textAlign: 'center',
                      opacity: grow,
                    }}
                  >
                    {bar.label}
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
