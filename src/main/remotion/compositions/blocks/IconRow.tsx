/**
 * IconRow — a horizontal row of icon tiles with labels.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) for its look so
 * the same block renders in every skin. All motion is frame-clock driven.
 */

import type { Palette } from '@shared/palettes';
import { HelpCircle, icons, type LucideIcon } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { IconRowProps } from './types';

/** Resolve a Lucide icon by its PascalCase name, with a safe fallback. */
const resolveIcon = (name: string): LucideIcon =>
  (icons as Record<string, LucideIcon>)[name] ?? HelpCircle;

export const IconRow: React.FC<IconRowProps> = ({
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
  // Row of N equal columns (gap 28); each label fits within its column.
  const colText = Math.round((cw - 28 * (items.length - 1)) / Math.max(1, items.length)) - 16;

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
              display: 'flex',
              justifyContent: 'space-between',
              gap: 28,
              marginTop: 64,
            }}
          >
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 16, stiffness: 120, mass: 0.8 },
              });
              const Icon = resolveIcon(item.icon);
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    opacity: e,
                    transform: `translateY(${interpolate(e, [0, 1], [34, 0])}px)`,
                  }}
                >
                  {/* Icon tile */}
                  <div
                    style={{
                      width: 130,
                      height: 130,
                      borderRadius: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `radial-gradient(120% 120% at 50% 0%, ${accent}30 0%, ${pal.foreground}0a 70%)`,
                      border: `1px solid ${accent}44`,
                      boxShadow: `0 18px 44px rgba(0,0,0,0.45), inset 0 1px 0 ${pal.foreground}22, 0 0 40px ${accent}1f`,
                      transform: `scale(${interpolate(e, [0, 1], [0.8, 1])})`,
                    }}
                  >
                    <Icon size={62} color={accent} strokeWidth={2} absoluteStrokeWidth />
                  </div>
                  <FitText
                    maxWidth={Math.min(colText, 320)}
                    maxFontSize={32}
                    minFontSize={18}
                    maxLines={2}
                    charWidthRatio={CHAR_WIDTH_RATIO.geist}
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 700,
                      lineHeight: 1.15,
                      color: pal.foreground,
                      marginTop: 26,
                      textAlign: 'center',
                    }}
                  >
                    {item.label}
                  </FitText>
                </div>
              );
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
