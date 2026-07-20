/**
 * Checklist — rows that tick in one at a time.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. Inner
 * content uses shadcn `Badge` (x/y done) + `Separator`, with lucide `Check`
 * (done, accent) / `Circle` (pending, dim). The tick stamps in with a spring
 * overshoot; all motion is frame-clock driven.
 */

import type { Palette } from '@shared/palettes';
import { Check, Circle } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { ChecklistProps } from './types';

export const Checklist: React.FC<ChecklistProps> = ({
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
  const doneCount = items.filter((it) => it.done).length;
  const cw = SKIN_CONTENT_WIDTH[skinId];
  // Heading shares its row with the done-count badge (~220px + 24px gap).
  const headWidth = cw - 244;
  // Row = 60px tick + 28px gap + text.
  const rowText = cw - 60 - 28 - 8;

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
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 24,
            }}
          >
            <div>
              <Kicker accent={accent} maxWidth={headWidth}>
                {kicker}
              </Kicker>
              <Heading fg={pal.foreground} maxWidth={headWidth}>
                {heading}
              </Heading>
            </div>
            <Badge
              className="border-transparent"
              style={{
                backgroundColor: `${accent}22`,
                color: accent,
                fontFamily: 'JetBrains Mono',
                fontSize: 26,
                padding: '10px 20px',
                borderRadius: 999,
                marginTop: 8,
                whiteSpace: 'nowrap',
              }}
            >
              {doneCount}/{items.length} done
            </Badge>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48 }}>
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 14, stiffness: 150, mass: 0.7 },
              });
              const tickScale = interpolate(e, [0, 1], [0.4, 1]);
              return (
                <div key={i}>
                  {i > 0 && (
                    <Separator style={{ opacity: 0.5 * e, backgroundColor: `${accent}33` }} />
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 28,
                      padding: '24px 4px',
                      opacity: interpolate(e, [0, 1], [0, 1]),
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 60,
                        height: 60,
                        borderRadius: 18,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: item.done ? accent : 'transparent',
                        border: item.done ? 'none' : `2px solid ${pal.foreground}33`,
                        boxShadow: item.done ? `0 8px 24px ${accent}55` : 'none',
                        transform: `scale(${tickScale})`,
                      }}
                    >
                      {item.done ? (
                        <Check size={36} color={pal.background} strokeWidth={3} />
                      ) : (
                        <Circle size={28} color={`${pal.foreground}55`} strokeWidth={2.5} />
                      )}
                    </div>
                    <FitText
                      maxWidth={rowText}
                      maxFontSize={46}
                      minFontSize={28}
                      maxLines={2}
                      charWidthRatio={CHAR_WIDTH_RATIO.geist}
                      style={{
                        flex: 1,
                        fontFamily: 'Geist',
                        fontWeight: 700,
                        lineHeight: 1.1,
                        color: item.done ? pal.foreground : `${pal.foreground}aa`,
                      }}
                    >
                      {item.text}
                    </FitText>
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
