/**
 * StatHero — one giant number that counts up to its target.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. The
 * delta sits in a shadcn `Badge` with a lucide `TrendingUp`/`TrendingDown`.
 * The count-up is driven by interpolate() over the frame clock.
 */

import type { Palette } from '@shared/palettes';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Badge } from '@/components/ui/badge';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { StatHeroProps } from './types';

export const StatHero: React.FC<StatHeroProps> = ({
  skinId,
  kicker,
  heading,
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  label,
  trend,
  delta,
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
  // Centered hero: let the headline number use the full measure; keep the
  // supporting copy at a readable width.
  const valueWidth = cw - 40;
  const labelWidth = Math.min(cw - 80, 1100);

  // Count up from 0 → value over ~1.2s, starting after the card settles.
  const counted = interpolate(frame, [14, 14 + fps * 1.2], [0, value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const display = `${prefix}${counted.toFixed(decimals)}${suffix}`;
  const deltaIn = spring({ frame: frame - 30, fps, config: { damping: 16, stiffness: 120 } });
  const TrendIcon = trend === 'down' ? TrendingDown : TrendingUp;
  const trendColor = trend === 'down' ? '#f87171' : '#4ade80';

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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <Kicker accent={accent} maxWidth={cw}>
              {kicker}
            </Kicker>
            <Heading size={72} fg={pal.foreground} maxWidth={cw}>
              {heading}
            </Heading>

            <FitText
              maxWidth={valueWidth}
              maxFontSize={300}
              minFontSize={140}
              maxLines={1}
              charWidthRatio={CHAR_WIDTH_RATIO.bebas}
              style={{
                fontFamily: 'Bebas Neue',
                lineHeight: 0.92,
                color: accent,
                textShadow: `0 0 60px ${accent}55`,
                marginTop: 24,
                textAlign: 'center',
              }}
            >
              {display}
            </FitText>

            <FitText
              maxWidth={labelWidth}
              maxFontSize={38}
              minFontSize={26}
              maxLines={2}
              charWidthRatio={CHAR_WIDTH_RATIO.geist}
              style={{
                fontFamily: 'Geist',
                fontWeight: 700,
                color: `${pal.foreground}cc`,
                marginTop: 8,
                textAlign: 'center',
              }}
            >
              {label}
            </FitText>

            {delta && (
              <Badge
                className="border-transparent"
                style={{
                  marginTop: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: `${trendColor}1f`,
                  color: trendColor,
                  fontFamily: 'JetBrains Mono',
                  fontSize: 30,
                  padding: '14px 26px',
                  borderRadius: 999,
                  opacity: deltaIn,
                  transform: `translateY(${interpolate(deltaIn, [0, 1], [16, 0])}px)`,
                }}
              >
                <TrendIcon size={32} color={trendColor} strokeWidth={2.6} />
                {delta}
              </Badge>
            )}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
