/**
 * DefinitionCard — a shadcn Card dictionary entry: lucide BookOpen, the term
 * with a part-of-speech Badge, a Separator, and the definition body. An accent
 * underline draws in under the term.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * entry panel is a shadcn `Card`. All motion is frame-clock driven.
 */

import type { Palette } from '@shared/palettes';
import { BookOpen } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { DefinitionCardProps } from './types';

export const DefinitionCard: React.FC<DefinitionCardProps> = ({
  skinId,
  kicker,
  heading,
  term,
  partOfSpeech,
  definition,
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
  // Cap the entry column to a comfortable measure so the card + definition fill
  // it consistently instead of bunching left on the wide editorial surface.
  const cw = Math.min(SKIN_CONTENT_WIDTH[skinId], 1380);
  const defWidth = cw - 96; // CardContent p-12 (48px each side)
  // Term sits left of the part-of-speech badge inside the card; leave room.
  const termWidth = cw - 96 - 80 - 20 - 220;

  const underline = interpolate(frame, [22, 22 + fps * 0.8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const defIn = spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 110 } });

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `radial-gradient(120% 120% at 50% 0%, ${accent}30 0%, ${pal.foreground}0a 70%)`,
                    border: `1px solid ${accent}44`,
                  }}
                >
                  <BookOpen size={44} color={accent} strokeWidth={2} absoluteStrokeWidth />
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'baseline', gap: 18, flex: 1, minWidth: 0 }}
                >
                  <FitText
                    maxWidth={Math.max(360, termWidth)}
                    maxFontSize={112}
                    minFontSize={60}
                    maxLines={1}
                    charWidthRatio={CHAR_WIDTH_RATIO.bebas}
                    style={{ fontFamily: 'Bebas Neue', lineHeight: 0.9, color: pal.foreground }}
                  >
                    {term}
                  </FitText>
                  {partOfSpeech && (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: `${accent}55`,
                        color: accent,
                        fontFamily: 'Geist',
                        fontStyle: 'italic',
                        fontSize: 28,
                        padding: '6px 16px',
                        borderRadius: 999,
                      }}
                    >
                      {partOfSpeech}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Accent underline draws in */}
              <div
                style={{
                  height: 4,
                  width: 220,
                  marginTop: 18,
                  marginLeft: 100,
                  borderRadius: 4,
                  background: accent,
                  transformOrigin: 'left center',
                  transform: `scaleX(${underline})`,
                  boxShadow: `0 0 18px ${accent}66`,
                }}
              />

              <Separator className="my-9" style={{ backgroundColor: `${accent}33` }} />

              <FitText
                maxWidth={defWidth}
                maxFontSize={44}
                minFontSize={28}
                maxLines={5}
                charWidthRatio={CHAR_WIDTH_RATIO.geist}
                style={{
                  fontFamily: 'Geist',
                  fontWeight: 400,
                  lineHeight: 1.4,
                  color: `${pal.foreground}dd`,
                  opacity: defIn,
                  transform: `translateY(${interpolate(defIn, [0, 1], [18, 0])}px)`,
                }}
              >
                {definition}
              </FitText>
            </CardContent>
          </Card>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
