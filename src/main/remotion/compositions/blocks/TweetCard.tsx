/**
 * TweetCard — a shadcn Card styled as a social post: Avatar, handle with a
 * lucide BadgeCheck verified mark, body, and an engagement row.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * post is a shadcn `Card`, the author uses shadcn `Avatar` and the engagement
 * counts use shadcn `Badge`. All motion is frame-clock driven.
 */

import type { Palette } from '@shared/palettes';
import { BadgeCheck, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { TweetCardProps } from './types';

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export const TweetCard: React.FC<TweetCardProps> = ({
  skinId,
  kicker,
  heading,
  name,
  handle,
  verified,
  avatarUrl,
  body,
  replies,
  reposts,
  likes,
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
  // Cap the post column to a comfortable measure so the card + body fill it
  // consistently instead of bunching left on the wide editorial surface.
  const cw = Math.min(SKIN_CONTENT_WIDTH[skinId], 1380);
  const bodyWidth = cw - 96; // CardContent p-12 (48px each side)
  const bodyIn = spring({ frame: frame - 20, fps, config: { damping: 18, stiffness: 110 } });
  const statsIn = spring({ frame: frame - 34, fps, config: { damping: 18, stiffness: 110 } });

  const stat = (
    Icon: typeof Heart,
    count: string | undefined,
    tint: string,
    key: string,
  ): React.ReactNode =>
    count ? (
      <Badge
        key={key}
        variant="outline"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          borderColor: `${pal.foreground}1f`,
          color: `${pal.foreground}cc`,
          fontFamily: 'JetBrains Mono',
          fontSize: 26,
          padding: '10px 18px',
          borderRadius: 999,
        }}
      >
        <Icon size={26} color={tint} strokeWidth={2.4} />
        {count}
      </Badge>
    ) : null;

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <Avatar
                  className="h-24 w-24"
                  style={{ border: `2px solid ${accent}66`, boxShadow: `0 0 24px ${accent}33` }}
                >
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                  <AvatarFallback
                    style={{
                      background: `${accent}22`,
                      color: accent,
                      fontFamily: 'Bebas Neue',
                      fontSize: 42,
                    }}
                  >
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontFamily: 'Geist',
                        fontWeight: 700,
                        fontSize: 40,
                        color: pal.foreground,
                      }}
                    >
                      {name}
                    </span>
                    {verified && <BadgeCheck size={36} color={accent} strokeWidth={2.4} />}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Geist',
                      fontSize: 30,
                      color: `${pal.foreground}88`,
                      marginTop: 2,
                    }}
                  >
                    @{handle}
                  </div>
                </div>
              </div>

              <FitText
                maxWidth={bodyWidth}
                maxFontSize={46}
                minFontSize={30}
                maxLines={6}
                charWidthRatio={CHAR_WIDTH_RATIO.geist}
                style={{
                  fontFamily: 'Geist',
                  lineHeight: 1.3,
                  color: `${pal.foreground}f2`,
                  marginTop: 34,
                  opacity: bodyIn,
                  transform: `translateY(${interpolate(bodyIn, [0, 1], [16, 0])}px)`,
                }}
              >
                {body}
              </FitText>

              <div
                style={{
                  display: 'flex',
                  gap: 18,
                  marginTop: 40,
                  opacity: statsIn,
                  transform: `translateY(${interpolate(statsIn, [0, 1], [16, 0])}px)`,
                }}
              >
                {stat(MessageCircle, replies, '#60a5fa', 'replies')}
                {stat(Repeat2, reposts, '#4ade80', 'reposts')}
                {stat(Heart, likes, '#f87171', 'likes')}
              </div>
            </CardContent>
          </Card>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
