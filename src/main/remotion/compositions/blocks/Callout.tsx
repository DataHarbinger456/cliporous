/**
 * Callout — the punchline moment. A single high-impact sentence rendered huge
 * and centered, with an optional small label above (kicker) and an optional
 * source/attribution line below. The simplest, most reusable content block.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. The
 * body sentence is AI-generated and unbounded, so it is sized with `FitText`
 * (deterministic shrink-to-fit) and can never overflow the 1920×1080 frame.
 * All motion is Remotion frame-clock driven (spring/interpolate).
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { CalloutProps } from './types';

export const Callout: React.FC<CalloutProps> = ({
  skinId,
  kicker,
  body,
  attribution,
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
  const bodyWidth = cw - 24;

  // Longer sentences shrink so they always fit; keep punchy lines huge.
  const len = body.trim().length;
  const maxFontSize = len < 60 ? 168 : len < 120 ? 132 : 104;

  const attribIn = spring({ frame: frame - 24, fps, config: { damping: 18, stiffness: 110 } });

  return (
    <AbsoluteFill
      style={{ backgroundColor: pal.background, justifyContent: 'center', alignItems: 'center' }}
    >
      <PrestyjFonts />
      <skin.Background accent={accent} bg={pal.background} fg={pal.foreground} />
      <div style={{ ...motion }}>
        <skin.Surface accent={accent} bg={pal.background} fg={pal.foreground}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            {kicker && (
              <Kicker accent={accent} maxWidth={cw}>
                {kicker}
              </Kicker>
            )}

            <FitText
              maxWidth={bodyWidth}
              maxFontSize={maxFontSize}
              minFontSize={56}
              maxLines={4}
              charWidthRatio={CHAR_WIDTH_RATIO.bebas}
              style={{
                fontFamily: 'Bebas Neue',
                lineHeight: 0.98,
                color: pal.foreground,
                textAlign: 'center',
                textShadow: `0 0 60px ${accent}33`,
              }}
            >
              {body}
            </FitText>

            {attribution && (
              <FitText
                maxWidth={Math.min(cw - 80, 1100)}
                maxFontSize={34}
                minFontSize={24}
                maxLines={2}
                charWidthRatio={CHAR_WIDTH_RATIO.mono}
                style={{
                  fontFamily: 'JetBrains Mono',
                  fontWeight: 500,
                  letterSpacing: 2,
                  color: accent,
                  marginTop: 36,
                  textAlign: 'center',
                  opacity: attribIn,
                  transform: `translateY(${interpolate(attribIn, [0, 1], [16, 0])}px)`,
                }}
              >
                {`— ${attribution}`}
              </FitText>
            )}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
