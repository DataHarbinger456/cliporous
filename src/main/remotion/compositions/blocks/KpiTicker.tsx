/**
 * KpiTicker — a row of shadcn Card stat tiles with a Badge delta, lucide trend
 * icon, and a pulsing status dot.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; each
 * tile is a shadcn `Card`. Tiles rise in on a staggered spring; the status dot
 * pulses off the frame clock.
 */

import type { Palette } from '@shared/palettes';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { KpiTickerProps } from './types';

export const KpiTicker: React.FC<KpiTickerProps> = ({
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
  const pulse = interpolate(Math.sin(frame * 0.18), [-1, 1], [0.55, 1]);
  const cw = SKIN_CONTENT_WIDTH[skinId];
  // Row of N cards (gap 24), each Card padded p-9 (36px each side).
  const cardText = Math.round((cw - 24 * (items.length - 1)) / Math.max(1, items.length)) - 72;
  const cardLabel = Math.max(0, cardText - 26); // leaves room for the status dot

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

          <div style={{ display: 'flex', gap: 24, marginTop: 56 }}>
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 },
              });
              const down = item.trend === 'down';
              const trendColor = down ? '#f87171' : '#4ade80';
              const TrendIcon = down ? TrendingDown : TrendingUp;
              return (
                <Card
                  key={i}
                  className="flex-1 border bg-card text-card-foreground"
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: trendColor,
                          boxShadow: `0 0 14px ${trendColor}`,
                          opacity: pulse,
                        }}
                      />
                      <FitText
                        maxWidth={cardLabel}
                        maxFontSize={24}
                        minFontSize={16}
                        maxLines={2}
                        charWidthRatio={CHAR_WIDTH_RATIO.mono}
                        letterSpacing={2}
                        style={{
                          flex: 1,
                          fontFamily: 'JetBrains Mono',
                          letterSpacing: 2,
                          color: `${pal.foreground}99`,
                        }}
                      >
                        {item.label}
                      </FitText>
                    </div>
                    <FitText
                      maxWidth={cardText}
                      maxFontSize={116}
                      minFontSize={60}
                      maxLines={1}
                      charWidthRatio={CHAR_WIDTH_RATIO.bebas}
                      style={{
                        fontFamily: 'Bebas Neue',
                        lineHeight: 0.92,
                        color: accent,
                        textShadow: `0 0 32px ${accent}40`,
                        marginTop: 18,
                      }}
                    >
                      {item.value}
                    </FitText>
                    {item.delta && (
                      <Badge
                        className="border-transparent"
                        style={{
                          marginTop: 18,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          backgroundColor: `${trendColor}1f`,
                          color: trendColor,
                          fontFamily: 'JetBrains Mono',
                          fontSize: 24,
                          padding: '8px 16px',
                          borderRadius: 999,
                        }}
                      >
                        <TrendIcon size={24} color={trendColor} strokeWidth={2.6} />
                        {item.delta}
                      </Badge>
                    )}
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
