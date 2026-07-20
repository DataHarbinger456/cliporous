/**
 * MapBlock — a stylized world/region map with one or more highlighted location
 * pins + labels. Used when the speaker references places, markets, or expansion
 * ("we shipped to 30 countries").
 *
 * Self-contained: NO mapping library, NO tile fetch, NO geocoding. The landmass
 * is a low-detail decorative SVG silhouette (abstract continents over a faint
 * graticule grid) that simply reads as "a map". Pins are placed by normalized
 * x/y (0-1) coordinates supplied in props — not real lat/long — and drop + pulse
 * in via the Remotion frame clock.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) so the same block
 * renders in every skin. All motion is frame-clock driven (CSS transitions are
 * inert in a rendered frame). Pins/landmass derive from accent/fg.
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { MapBlockProps } from './types';

/* ------------------------------------------------------------------ */
/*  Decorative landmass — low-detail abstract continents (viewBox      */
/*  1000×500). Not geographically accurate; just needs to read as a    */
/*  map. Filled from fg/accent at low alpha.                            */
/* ------------------------------------------------------------------ */

const CONTINENTS: string[] = [
  // North America
  'M120,92 C160,70 232,80 252,120 C272,150 240,182 252,212 C228,212 208,190 178,196 C148,202 138,168 118,150 C98,130 95,106 120,92 Z',
  // South America
  'M252,262 C282,250 302,282 296,322 C290,362 270,402 250,432 C234,410 230,370 236,340 C240,310 230,282 252,262 Z',
  // Europe
  'M472,112 C502,100 522,116 516,142 C510,162 486,166 470,156 C454,146 450,122 472,112 Z',
  // Africa
  'M482,192 C522,180 556,212 550,262 C544,312 514,360 490,382 C470,360 466,320 472,290 C477,252 456,212 482,192 Z',
  // Asia
  'M560,90 C642,68 762,80 822,120 C862,150 822,182 790,188 C740,198 690,172 640,178 C600,182 560,152 560,120 Z',
  // Australia
  'M782,332 C822,320 862,336 856,366 C850,392 814,402 790,392 C770,384 762,346 782,332 Z',
];

/* ------------------------------------------------------------------ */
/*  Pin                                                                 */
/* ------------------------------------------------------------------ */

const Pin: React.FC<{
  label: string;
  valueLabel?: string;
  /** Normalised position within the map box. */
  x: number;
  y: number;
  /** Frame the pin starts dropping in. */
  startFrame: number;
  accent: string;
  bg: string;
  fg: string;
  maxLabelWidth: number;
}> = ({ label, valueLabel, x, y, startFrame, accent, bg, fg, maxLabelWidth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Drop-in: spring fall from above + scale up.
  const drop = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 150, mass: 0.7 },
  });
  const dropY = interpolate(drop, [0, 1], [-46, 0]);

  // Repeating pulse ring once the pin has landed.
  const since = frame - startFrame;
  const cycle = fps * 1.4;
  const phase = since > 0 ? (since % cycle) / cycle : 0;
  const ringScale = interpolate(phase, [0, 1], [0.5, 2.4]);
  const ringOpacity = drop > 0.8 ? interpolate(phase, [0, 1], [0.45, 0]) : 0;

  const left = `${x * 100}%`;
  const top = `${y * 100}%`;

  return (
    <>
      {/* Pulse ring — centred on the point. */}
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: 34,
          height: 34,
          marginLeft: -17,
          marginTop: -17,
          borderRadius: '50%',
          border: `2px solid ${accent}`,
          opacity: ringOpacity,
          transform: `scale(${ringScale})`,
          pointerEvents: 'none',
        }}
      />

      {/* Teardrop marker — tip sits exactly on the point. */}
      <div
        style={{
          position: 'absolute',
          left,
          top,
          transform: `translate(-50%, -100%) translateY(${dropY}px)`,
          opacity: drop,
          transformOrigin: '50% 100%',
        }}
      >
        <svg width={34} height={44} viewBox="0 0 24 32" fill="none">
          <path
            d="M12 0 C5 0 0 5 0 12 C0 21 12 32 12 32 C12 32 24 21 24 12 C24 5 19 0 12 0 Z"
            fill={accent}
            stroke={fg}
            strokeWidth={1}
          />
          <circle cx={12} cy={12} r={4.5} fill={bg} />
        </svg>
      </div>

      {/* Label pill — just below the point. */}
      <div
        style={{
          position: 'absolute',
          left,
          top,
          transform: 'translate(-50%, 10px)',
          opacity: drop,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 16px',
          borderRadius: 12,
          background: `${bg}d9`,
          border: `1px solid ${accent}66`,
          boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 24px ${accent}1f`,
          whiteSpace: 'nowrap',
        }}
      >
        <FitText
          maxWidth={maxLabelWidth}
          maxFontSize={26}
          minFontSize={16}
          maxLines={1}
          charWidthRatio={CHAR_WIDTH_RATIO.geist}
          style={{ fontFamily: 'Geist', fontWeight: 700, color: fg, lineHeight: 1.1 }}
        >
          {label}
        </FitText>
        {valueLabel ? (
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 16,
              letterSpacing: 1,
              color: accent,
              marginTop: 2,
            }}
          >
            {valueLabel}
          </span>
        ) : null}
      </div>
    </>
  );
};

export const MapBlock: React.FC<MapBlockProps> = ({
  skinId,
  kicker,
  heading,
  pins,
  accentColor,
  palette,
}) => {
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

  // Map box: a 2:1 world ratio fitted to the content width (height capped so it
  // never crowds the heading on the wide editorial surface).
  const mapW = cw;
  const mapH = Math.min(Math.round(cw * 0.5), 660);

  // Pins are positioned by percentage, so coordinate is clamped to a sensible
  // inner band to keep markers/labels from clipping the map edges.
  const clamp = (v: number): number => Math.min(0.94, Math.max(0.06, Number.isFinite(v) ? v : 0.5));

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
          <Heading fg={pal.foreground} maxWidth={cw}>
            {heading}
          </Heading>

          <div
            style={{
              position: 'relative',
              width: mapW,
              height: mapH,
              marginTop: 56,
            }}
          >
            {/* Stylized map silhouette + graticule grid. */}
            <svg
              width={mapW}
              height={mapH}
              viewBox="0 0 1000 500"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0 }}
            >
              {/* Graticule — faint latitude/longitude grid for geographic feel. */}
              {[125, 250, 375, 500, 625, 750, 875].map((gx) => (
                <line
                  key={`v${gx}`}
                  x1={gx}
                  y1={0}
                  x2={gx}
                  y2={500}
                  stroke={pal.foreground}
                  strokeWidth={1}
                  opacity={0.06}
                />
              ))}
              {[125, 250, 375].map((gy) => (
                <line
                  key={`h${gy}`}
                  x1={0}
                  y1={gy}
                  x2={1000}
                  y2={gy}
                  stroke={pal.foreground}
                  strokeWidth={1}
                  opacity={0.06}
                />
              ))}
              {/* Continents — decorative, not accurate. */}
              {CONTINENTS.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={`${pal.foreground}1f`}
                  stroke={`${accent}88`}
                  strokeWidth={1.5}
                />
              ))}
            </svg>

            {/* Pins overlaid in HTML so labels stay crisp; positioned by % of
                the map box from the normalized x/y props. */}
            {pins.map((pin, i) => (
              <Pin
                key={`${pin.label}-${i}`}
                label={pin.label}
                valueLabel={pin.valueLabel}
                x={clamp(pin.x)}
                y={clamp(pin.y)}
                startFrame={14 + i * 8}
                accent={accent}
                bg={pal.background}
                fg={pal.foreground}
                maxLabelWidth={Math.min(320, Math.round(mapW / 3))}
              />
            ))}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
