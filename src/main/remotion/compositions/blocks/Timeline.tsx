/**
 * Timeline — a vertical step sequence with a connecting spine.
 *
 * A *content block*: it knows nothing about color or surface. It composes a
 * `BlockSkin` for its look (background, surface, index chip) so the same block
 * renders in every skin. New blocks should follow this shape.
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { TimelineProps } from './types';

export type { TimelineProps, TimelineStep } from './types';

export const Timeline: React.FC<TimelineProps> = ({
  skinId,
  kicker,
  heading,
  steps,
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
  // Row = 8px inset + 62px chip + 32px gap + text.
  const rowText = cw - 8 - 62 - 32 - 8;

  // Spine draws downward as steps reveal.
  const spineProgress = interpolate(frame, [14, 14 + steps.length * 7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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

          <div style={{ position: 'relative', marginTop: 56, paddingLeft: 8 }}>
            {/* Spine */}
            <div
              style={{
                position: 'absolute',
                left: 38,
                top: 40,
                bottom: 40,
                width: 3,
                background: `${accent}44`,
                transformOrigin: 'top',
                transform: `scaleY(${spineProgress})`,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              {steps.map((step, i) => {
                const e = spring({
                  frame: frame - 16 - i * 7,
                  fps,
                  config: { damping: 18, stiffness: 120 },
                });
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 32,
                      opacity: e,
                      transform: `translateX(${interpolate(e, [0, 1], [-30, 0])}px)`,
                    }}
                  >
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <skin.Chip
                        accent={accent}
                        bg={pal.background}
                        fg={pal.foreground}
                        index={i + 1}
                        size={62}
                      />
                    </div>
                    <div style={{ paddingTop: 4, flex: 1, minWidth: 0 }}>
                      <FitText
                        maxWidth={rowText}
                        maxFontSize={52}
                        minFontSize={32}
                        maxLines={2}
                        charWidthRatio={CHAR_WIDTH_RATIO.geist}
                        style={{
                          fontFamily: 'Geist',
                          fontWeight: 700,
                          color: pal.foreground,
                          lineHeight: 1.05,
                        }}
                      >
                        {step.title}
                      </FitText>
                      {step.detail && (
                        <FitText
                          maxWidth={rowText}
                          maxFontSize={30}
                          minFontSize={20}
                          maxLines={2}
                          charWidthRatio={CHAR_WIDTH_RATIO.geist}
                          style={{
                            fontFamily: 'Geist',
                            fontWeight: 400,
                            color: `${pal.foreground}99`,
                            marginTop: 8,
                            lineHeight: 1.3,
                          }}
                        >
                          {step.detail}
                        </FitText>
                      )}
                    </div>
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
