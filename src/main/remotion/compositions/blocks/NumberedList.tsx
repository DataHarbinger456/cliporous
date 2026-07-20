/**
 * NumberedList — vertical numbered rows with a shadcn Separator between each.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) for its look so
 * the same block renders in every skin. Inner rows are built from shadcn
 * primitives (`Separator`) + a lucide `ArrowRight`; all motion is frame-clock
 * driven via spring()/interpolate().
 */

import type { Palette } from '@shared/palettes';
import { ArrowRight } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Separator } from '@/components/ui/separator';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { NumberedListProps } from './types';

export const NumberedList: React.FC<NumberedListProps> = ({
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
  // Row = 62px chip + 32px gap + text + 32px gap + 40px arrow.
  const rowText = cw - 62 - 40 - 32 * 2 - 8;

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

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 52 }}>
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 18, stiffness: 120 },
              });
              return (
                <div key={i}>
                  {i > 0 && (
                    <Separator
                      className="bg-border"
                      style={{ opacity: 0.5 * e, backgroundColor: `${accent}33` }}
                    />
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 32,
                      padding: '26px 4px',
                      opacity: e,
                      transform: `translateX(${interpolate(e, [0, 1], [-34, 0])}px)`,
                    }}
                  >
                    <skin.Chip
                      accent={accent}
                      bg={pal.background}
                      fg={pal.foreground}
                      index={i + 1}
                      size={62}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <FitText
                        maxWidth={rowText}
                        maxFontSize={50}
                        minFontSize={30}
                        maxLines={2}
                        charWidthRatio={CHAR_WIDTH_RATIO.geist}
                        style={{
                          fontFamily: 'Geist',
                          fontWeight: 700,
                          color: pal.foreground,
                          lineHeight: 1.05,
                        }}
                      >
                        {item.text}
                      </FitText>
                      {item.detail && (
                        <FitText
                          maxWidth={rowText}
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
                          {item.detail}
                        </FitText>
                      )}
                    </div>
                    <ArrowRight
                      size={40}
                      color={accent}
                      strokeWidth={2.4}
                      style={{ opacity: e, flexShrink: 0 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
