/**
 * FeatureGrid — four shadcn Cards laid out 2×2, each a lucide icon + title +
 * description.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * inner tiles are shadcn `Card`s. Cards rise in on a staggered spring. The
 * skin.Surface runs wider/barer here so the Cards don't double-pad.
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { breakWordStyle, clampStyle } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import { resolveIcon } from './icon';
import type { FeatureGridProps } from './types';

export const FeatureGrid: React.FC<FeatureGridProps> = ({
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
                    transform: `translateY(${interpolate(e, [0, 1], [34, 0])}px) scale(${interpolate(
                      e,
                      [0, 1],
                      [0.94, 1],
                    )})`,
                  }}
                >
                  <CardHeader className="gap-4 p-9">
                    <div
                      style={{
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
                      <Icon size={48} color={accent} strokeWidth={2} absoluteStrokeWidth />
                    </div>
                    <CardTitle
                      style={{
                        fontFamily: 'Geist',
                        fontWeight: 700,
                        fontSize: 40,
                        color: pal.foreground,
                        letterSpacing: 0,
                        ...breakWordStyle,
                        ...clampStyle(2),
                      }}
                    >
                      {item.title}
                    </CardTitle>
                    <CardDescription
                      style={{
                        fontFamily: 'Geist',
                        fontSize: 27,
                        lineHeight: 1.35,
                        color: `${pal.foreground}99`,
                        ...breakWordStyle,
                        ...clampStyle(4),
                      }}
                    >
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
