/**
 * QuoteCard — a shadcn Card holding a large pull quote with a lucide Quote mark
 * and a shadcn Avatar attribution.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * quote panel is a shadcn `Card`, the attribution uses shadcn `Avatar`. The
 * quote reveals via a frame-driven clip mask.
 */

import type { Palette } from '@shared/palettes';
import { Quote } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { QuoteCardProps } from './types';

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export const QuoteCard: React.FC<QuoteCardProps> = ({
  skinId,
  kicker,
  heading,
  quote,
  name,
  role,
  avatarUrl,
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
  // Cap the reading column to a comfortable measure so the card + quote fill it
  // consistently instead of bunching left on the wide editorial surface.
  const cw = Math.min(SKIN_CONTENT_WIDTH[skinId], 1380);
  const quoteWidth = cw - 96; // CardContent p-12 (48px each side)

  const reveal = interpolate(frame, [16, 16 + fps * 1], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const attrIn = spring({ frame: frame - 34, fps, config: { damping: 18, stiffness: 110 } });

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

          <Card
            className="border bg-card text-card-foreground"
            style={{
              marginTop: 48,
              maxWidth: cw,
              borderColor: `${accent}33`,
              boxShadow: `0 26px 70px rgba(0,0,0,0.45), inset 0 1px 0 ${pal.foreground}12`,
            }}
          >
            <CardContent className="p-12">
              <Quote size={72} color={accent} strokeWidth={2.2} style={{ opacity: 0.9 }} />
              <div
                style={{
                  marginTop: 24,
                  clipPath: `inset(0 ${100 - reveal}% 0 0)`,
                }}
              >
                <FitText
                  maxWidth={quoteWidth}
                  maxFontSize={76}
                  minFontSize={44}
                  maxLines={4}
                  charWidthRatio={CHAR_WIDTH_RATIO.serif}
                  style={{
                    fontFamily: 'Instrument Serif',
                    fontStyle: 'italic',
                    lineHeight: 1.18,
                    color: pal.foreground,
                  }}
                >
                  {quote}
                </FitText>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                  marginTop: 44,
                  opacity: attrIn,
                  transform: `translateY(${interpolate(attrIn, [0, 1], [16, 0])}px)`,
                }}
              >
                <Avatar
                  className="h-20 w-20"
                  style={{ border: `2px solid ${accent}66`, boxShadow: `0 0 24px ${accent}33` }}
                >
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                  <AvatarFallback
                    style={{
                      background: `${accent}22`,
                      color: accent,
                      fontFamily: 'Bebas Neue',
                      fontSize: 36,
                    }}
                  >
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 700,
                      fontSize: 36,
                      color: pal.foreground,
                    }}
                  >
                    {name}
                  </div>
                  {role && (
                    <div
                      style={{
                        fontFamily: 'Geist',
                        fontSize: 28,
                        color: `${pal.foreground}99`,
                        marginTop: 4,
                      }}
                    >
                      {role}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
