/**
 * TimelineCards — a vertical step sequence where each step is a shadcn Card on
 * a connecting spine, with a lucide icon per step (Card variant of Timeline).
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; each
 * step body is a shadcn `Card`. The spine draws downward as the cards reveal.
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Card, CardContent } from '@/components/ui/card';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import { resolveIcon } from './icon';
import type { TimelineCardsProps } from './types';

export const TimelineCards: React.FC<TimelineCardsProps> = ({
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
  // Row = 80px node + 32px gap + Card; CardContent p-7 (28px each side).
  const cardText = cw - 80 - 32 - 56;

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

          <div style={{ position: 'relative', marginTop: 52, paddingLeft: 8 }}>
            {/* Spine */}
            <div
              style={{
                position: 'absolute',
                left: 47,
                top: 48,
                bottom: 48,
                width: 3,
                background: `${accent}44`,
                transformOrigin: 'top',
                transform: `scaleY(${spineProgress})`,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {steps.map((step, i) => {
                const e = spring({
                  frame: frame - 16 - i * 7,
                  fps,
                  config: { damping: 18, stiffness: 120 },
                });
                const Icon = resolveIcon(step.icon);
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 32,
                      opacity: e,
                      transform: `translateX(${interpolate(e, [0, 1], [-34, 0])}px)`,
                    }}
                  >
                    {/* Spine node */}
                    <div
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        flexShrink: 0,
                        width: 80,
                        height: 80,
                        borderRadius: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: accent,
                        boxShadow: `0 10px 30px ${accent}66, inset 0 1px 0 ${pal.foreground}33`,
                        transform: `scale(${interpolate(e, [0, 1], [0.8, 1])})`,
                      }}
                    >
                      <Icon size={42} color={pal.background} strokeWidth={2.4} />
                    </div>
                    <Card
                      className="flex-1 border bg-card text-card-foreground"
                      style={{
                        borderColor: `${accent}33`,
                        boxShadow: `0 16px 40px rgba(0,0,0,0.4), inset 0 1px 0 ${pal.foreground}12`,
                      }}
                    >
                      <CardContent className="p-7">
                        <FitText
                          maxWidth={cardText}
                          maxFontSize={44}
                          minFontSize={28}
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
                            maxWidth={cardText}
                            maxFontSize={28}
                            minFontSize={20}
                            maxLines={2}
                            charWidthRatio={CHAR_WIDTH_RATIO.geist}
                            style={{
                              fontFamily: 'Geist',
                              fontWeight: 400,
                              color: `${pal.foreground}99`,
                              marginTop: 6,
                              lineHeight: 1.3,
                            }}
                          >
                            {step.detail}
                          </FitText>
                        )}
                      </CardContent>
                    </Card>
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
