/**
 * IconStatGrid — a 2×2 grid of shadcn Cards, each combining a lucide icon, a
 * big number, and a label (merges IconRow + StatGrid via Cards).
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; each
 * tile is a shadcn `Card`. Tiles rise in on a staggered spring.
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
import type { IconStatGridProps } from './types';

export const IconStatGrid: React.FC<IconStatGridProps> = ({
  skinId,
  kicker,
  heading,
  items,
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
  // 2-col grid (gap 28); each Card p-9 (36px) holds a 96px icon + 22px gap.
  const tileText = Math.round((cw - 28) / 2) - 72 - 96 - 22;

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
              marginTop: 56,
            }}
          >
            {items.slice(0, 4).map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 },
              });
              const Icon = resolveIcon(item.icon);
              return (
                <Card
                  key={i}
                  className="border bg-card text-card-foreground"
                  style={{
                    borderColor: `${accent}33`,
                    boxShadow: `0 18px 44px rgba(0,0,0,0.4), inset 0 1px 0 ${pal.foreground}12`,
                    opacity: e,
                    transform: `translateY(${interpolate(e, [0, 1], [30, 0])}px) scale(${interpolate(
                      e,
                      [0, 1],
                      [0.94, 1],
                    )})`,
                  }}
                >
                  <CardContent className="p-9">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                      <div
                        style={{
                          flexShrink: 0,
                          width: 96,
                          height: 96,
                          borderRadius: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `radial-gradient(120% 120% at 50% 0%, ${accent}30 0%, ${pal.foreground}0a 70%)`,
                          border: `1px solid ${accent}44`,
                        }}
                      >
                        <Icon size={50} color={accent} strokeWidth={2} absoluteStrokeWidth />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <FitText
                          maxWidth={tileText}
                          maxFontSize={100}
                          minFontSize={56}
                          maxLines={1}
                          charWidthRatio={CHAR_WIDTH_RATIO.bebas}
                          style={{
                            fontFamily: 'Bebas Neue',
                            lineHeight: 0.9,
                            color: accent,
                            textShadow: `0 0 32px ${accent}40`,
                          }}
                        >
                          {item.value}
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
                            marginTop: 8,
                          }}
                        >
                          {item.label}
                        </FitText>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
