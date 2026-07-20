/**
 * ProgressBars — horizontal ranked bars that grow from the left.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. Each
 * bar track is a shadcn `Progress`; the fill is an accent child whose width is
 * interpolated by the frame clock (rather than radix's CSS value transition,
 * which is inert in a rendered frame).
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Progress } from '@/components/ui/progress';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { ProgressBarsProps } from './types';

export const ProgressBars: React.FC<ProgressBarsProps> = ({
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
  // Label sits left of the value (maxWidth 260 + 24px margin) on a baseline row.
  const labelWidth = cw - 260 - 24;

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 38, marginTop: 60 }}>
            {bars.map((bar, i) => {
              const grow = spring({
                frame: frame - 16 - i * 6,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 },
              });
              const value = Math.max(0, Math.min(1, bar.value));
              const pct = value * grow * 100;
              return (
                <div key={i}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 16,
                      opacity: grow,
                    }}
                  >
                    <FitText
                      maxWidth={labelWidth}
                      maxFontSize={34}
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
                      {bar.label}
                    </FitText>
                    <FitText
                      maxWidth={260}
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
                      {bar.valueLabel}
                    </FitText>
                  </div>
                  {/* shadcn Progress is the styled track; its own Indicator is
                      left empty (value 0) and the accent fill is overlaid as a
                      sibling so the width is frame-clock driven, not radix CSS. */}
                  <div style={{ position: 'relative' }}>
                    <Progress
                      value={0}
                      className="h-7 rounded-full"
                      style={{
                        backgroundColor: `${pal.foreground}14`,
                        border: `1px solid ${accent}22`,
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${pct}%`,
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${accent}cc 0%, ${accent} 100%)`,
                        boxShadow: `0 0 24px ${accent}55`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
