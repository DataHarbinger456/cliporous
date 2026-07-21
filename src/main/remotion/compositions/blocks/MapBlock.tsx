/**
 * MapBlock — a recognizable world map with one or more highlighted location
 * pins + labels. Used when the speaker references places, markets, or expansion
 * ("we shipped to 30 countries").
 *
 * Self-contained: NO mapping library, tile fetch, or geocoding. The landmass is
 * a simplified equirectangular SVG silhouette inside a globe frame. Pins use
 * normalized x/y coordinates supplied in props — not real lat/long — and drop
 * + pulse in via the Remotion frame clock.
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
/*  Simplified world silhouette — recognizable equirectangular coast   */
/*  shapes within a globe frame (viewBox 1000×500).                    */
/* ------------------------------------------------------------------ */

const CONTINENTS = [
  {
    id: 'north-america',
    path: 'M58,103 L88,77 L137,63 L184,70 L210,91 L248,82 L282,104 L267,128 L238,137 L226,158 L202,166 L190,198 L165,218 L148,202 L131,177 L103,166 L90,143 L64,133 L48,116 Z',
  },
  {
    id: 'greenland',
    path: 'M236,42 L273,27 L307,43 L297,76 L270,94 L243,77 Z',
  },
  {
    id: 'central-america',
    path: 'M165,216 L190,218 L211,232 L226,247 L216,258 L192,246 L176,235 Z',
  },
  {
    id: 'south-america',
    path: 'M220,251 L253,245 L282,266 L290,298 L278,326 L269,357 L249,391 L231,431 L214,415 L204,380 L190,348 L186,314 L199,286 L207,263 Z',
  },
  {
    id: 'europe',
    path: 'M445,112 L466,95 L492,99 L504,87 L519,99 L543,104 L554,122 L537,135 L520,132 L510,148 L489,143 L475,153 L458,141 L438,137 Z',
  },
  {
    id: 'africa',
    path: 'M456,164 L489,150 L529,158 L558,183 L562,221 L548,256 L531,288 L515,333 L491,366 L469,343 L454,307 L432,278 L425,235 L437,198 Z',
  },
  {
    id: 'asia',
    path: 'M532,94 L577,72 L631,69 L675,81 L716,74 L762,91 L807,99 L848,121 L873,143 L853,163 L817,158 L792,177 L758,170 L731,190 L697,183 L674,199 L650,184 L621,177 L602,156 L571,151 L549,130 Z',
  },
  {
    id: 'arabia-india',
    path: 'M561,189 L589,180 L615,201 L631,226 L648,238 L634,267 L612,247 L595,224 L572,218 Z M660,207 L687,221 L705,247 L691,285 L671,268 L660,239 Z',
  },
  {
    id: 'southeast-asia',
    path: 'M716,208 L744,220 L759,242 L785,250 L774,270 L747,261 L731,243 L709,235 Z M798,205 L811,215 L805,241 L793,231 Z',
  },
  {
    id: 'japan',
    path: 'M840,151 L850,167 L845,190 L837,177 Z',
  },
  {
    id: 'australia',
    path: 'M764,326 L801,310 L843,317 L873,341 L868,374 L842,398 L804,401 L776,383 L752,355 Z',
  },
  {
    id: 'new-zealand',
    path: 'M894,375 L904,390 L899,415 L889,401 Z',
  },
] as const;

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

  // Keep a true 2:1 world ratio so coastlines stay recognizable on every skin.
  const mapW = Math.min(cw, 1320);
  const mapH = Math.round(mapW * 0.5);

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
              margin: '56px auto 0',
            }}
          >
            {/* Globe frame, graticule, and recognizable continent silhouettes. */}
            <svg
              width={mapW}
              height={mapH}
              viewBox="0 0 1000 500"
              preserveAspectRatio="xMidYMid meet"
              style={{ position: 'absolute', inset: 0 }}
              role="img"
              aria-label="World map"
            >
              <defs>
                <clipPath id="world-map-frame">
                  <ellipse cx={500} cy={250} rx={472} ry={220} />
                </clipPath>
              </defs>
              <ellipse
                cx={500}
                cy={250}
                rx={472}
                ry={220}
                fill={`${pal.foreground}05`}
                stroke={`${accent}80`}
                strokeWidth={2}
              />
              <g clipPath="url(#world-map-frame)">
                {[125, 250, 375, 500, 625, 750, 875].map((gx) => (
                  <ellipse
                    key={`longitude-${gx}`}
                    cx={500}
                    cy={250}
                    rx={Math.abs(gx - 500)}
                    ry={220}
                    fill="none"
                    stroke={pal.foreground}
                    strokeWidth={1}
                    opacity={0.07}
                  />
                ))}
                {[125, 250, 375].map((gy) => (
                  <line
                    key={`latitude-${gy}`}
                    x1={28}
                    y1={gy}
                    x2={972}
                    y2={gy}
                    stroke={pal.foreground}
                    strokeWidth={1}
                    opacity={0.07}
                  />
                ))}
                {CONTINENTS.map((continent) => (
                  <path
                    key={continent.id}
                    d={continent.path}
                    fill={`${pal.foreground}24`}
                    stroke={`${accent}8f`}
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
              </g>
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
