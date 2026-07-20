/**
 * PortraitQuote — a large pull-quote next to a portrait of the person quoted,
 * with their name + role beneath.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. The
 * portrait sits left, the quote + attribution right; on the narrower skins the
 * two stack. The quote reveals via a frame-driven clip mask and is sized
 * responsively with the shared `FitText` helper since the body is AI-generated
 * and unbounded in length.
 *
 * IMAGE: an optional `imageUrl` (http URL, absolute path, or staticFile()-
 * resolvable relative path) renders as the portrait; absent, it falls back to
 * large initials exactly like QuoteCard's avatar handling. A real fetched
 * portrait is NOT wired through render yet — see the TODO on `imageUrl` in
 * ./types.ts and the `split-image` `imagePath` flow in registry.ts /
 * FullscreenQuotePlusBroll.tsx for the pattern to follow.
 */

import type { Palette } from '@shared/palettes';
import { Quote } from 'lucide-react';
import type React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { PortraitQuoteProps } from './types';

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/** Resolve a portrait source: http(s) and data URIs pass through, absolute
 * filesystem paths become file:// URLs, everything else resolves via
 * staticFile() (Studio preview). Mirrors FullscreenQuotePlusBroll. */
function resolveImage(src: string | undefined): string | null {
  if (!src) return null;
  if (/^(https?:|data:|file:)/.test(src)) return src;
  if (src.startsWith('/')) return `file://${src}`;
  return staticFile(src);
}

export const PortraitQuote: React.FC<PortraitQuoteProps> = ({
  skinId,
  kicker,
  heading,
  quote,
  name,
  role,
  imageUrl,
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
  // Stack the portrait above the quote on the narrower surfaces; otherwise sit
  // them side by side. 1240px is the comfortable threshold for a two-column read.
  const stacked = cw < 1240;
  const portraitSize = stacked ? 280 : 420;
  const quoteWidth = stacked ? cw : cw - portraitSize - 72;

  const portrait = resolveImage(imageUrl);

  const imgEnter = spring({
    frame: frame - 6,
    fps,
    config: { damping: 22, stiffness: 90, mass: 0.9 },
  });
  const imgScale = 0.92 + 0.08 * imgEnter;
  const reveal = interpolate(frame, [16, 16 + fps * 1], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const attrIn = spring({ frame: frame - 34, fps, config: { damping: 18, stiffness: 110 } });

  const Portrait = (
    <div
      style={{
        flexShrink: 0,
        width: portraitSize,
        height: portraitSize,
        borderRadius: 28,
        overflow: 'hidden',
        position: 'relative',
        transform: `scale(${imgScale})`,
        opacity: imgEnter,
        border: `2px solid ${accent}66`,
        boxShadow: `0 26px 70px rgba(0,0,0,0.5), 0 0 36px ${accent}33`,
        background: `${accent}1f`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {portrait ? (
        <>
          <Img src={portrait} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(180deg, transparent 58%, ${accent}26 100%)`,
            }}
          />
        </>
      ) : (
        <span
          style={{
            fontFamily: 'Bebas Neue',
            fontSize: portraitSize * 0.42,
            color: accent,
            lineHeight: 1,
          }}
        >
          {initials(name)}
        </span>
      )}
    </div>
  );

  const QuoteColumn = (
    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
      <Quote size={64} color={accent} strokeWidth={2.2} style={{ opacity: 0.9 }} />
      <div style={{ marginTop: 20, clipPath: `inset(0 ${100 - reveal}% 0 0)` }}>
        <FitText
          maxWidth={quoteWidth}
          maxFontSize={72}
          minFontSize={40}
          maxLines={5}
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
          marginTop: 36,
          opacity: attrIn,
          transform: `translateY(${interpolate(attrIn, [0, 1], [16, 0])}px)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 40, height: 3, background: accent, borderRadius: 2 }} />
          <span
            style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 38, color: pal.foreground }}
          >
            {name}
          </span>
        </div>
        {role && (
          <div
            style={{
              fontFamily: 'Geist',
              fontSize: 28,
              color: `${pal.foreground}99`,
              marginTop: 8,
              marginLeft: 54,
            }}
          >
            {role}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AbsoluteFill
      style={{ backgroundColor: pal.background, justifyContent: 'center', alignItems: 'center' }}
    >
      <PrestyjFonts />
      <skin.Background accent={accent} bg={pal.background} fg={pal.foreground} />
      <div style={{ ...motion }}>
        <skin.Surface accent={accent} bg={pal.background} fg={pal.foreground}>
          <Kicker accent={accent} maxWidth={cw}>
            {kicker}
          </Kicker>
          {heading ? (
            <Heading fg={pal.foreground} maxWidth={cw}>
              {heading}
            </Heading>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexDirection: stacked ? 'column' : 'row',
              alignItems: stacked ? 'flex-start' : 'center',
              gap: stacked ? 40 : 72,
              marginTop: 44,
            }}
          >
            {Portrait}
            {QuoteColumn}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
