/**
 * SkinThumbnail — a tiny static 16:9 mock tile that approximates the aesthetic
 * of each long-form block skin, so the skin choice is visual instead of
 * name-only. These are lightweight inline SVGs (NOT a Remotion player): they
 * caricature the real skins in `src/main/remotion/shared/skins.tsx`:
 *   • Editorial    — column-grid hairlines + big serif/condensed index.
 *   • Aurora Glass — blurred radial accent blobs behind a glass panel.
 *   • Bento        — radial spotlight + a hard rounded accent chip.
 *   • Terminal     — fine drafting grid + monospace index.
 *
 * Colors mirror the brand tokens used by the real skins (bg #23100c,
 * fg #f6ecd9, accent #9f75ff) so previews read true to the rendered output.
 */

import type { LongformSkinId } from '@shared/types';
import type * as React from 'react';

// Brand tokens — mirror BRAND_BG / BRAND_FG / BRAND_ACCENT used by the skins.
const BG = '#23100c';
const FG = '#f6ecd9';
const ACCENT = '#9f75ff';

const VB_W = 96;
const VB_H = 54;

function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <rect x={0} y={0} width={VB_W} height={VB_H} fill={BG} />
      {children}
    </svg>
  );
}

function EditorialThumb(): React.JSX.Element {
  return (
    <Frame>
      {/* Column-grid vertical hairlines. */}
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={VB_W * p}
          y1={6}
          x2={VB_W * p}
          y2={VB_H - 6}
          stroke={FG}
          strokeOpacity={0.14}
          strokeWidth={0.6}
        />
      ))}
      {/* Top + bottom accent running rules. */}
      <line
        x1={8}
        y1={11}
        x2={VB_W - 8}
        y2={11}
        stroke={ACCENT}
        strokeOpacity={0.5}
        strokeWidth={0.8}
      />
      <line
        x1={8}
        y1={VB_H - 11}
        x2={VB_W - 8}
        y2={VB_H - 11}
        stroke={ACCENT}
        strokeOpacity={0.5}
        strokeWidth={0.8}
      />
      {/* Oversized condensed index. */}
      <text
        x={9}
        y={37}
        fill={ACCENT}
        fontSize={26}
        fontFamily="'Bebas Neue', 'Oswald', sans-serif"
        fontWeight={700}
        letterSpacing={1}
      >
        01
      </text>
      {/* Headline bars. */}
      <rect x={40} y={20} width={46} height={4} rx={1} fill={FG} fillOpacity={0.85} />
      <rect x={40} y={28} width={36} height={4} rx={1} fill={FG} fillOpacity={0.55} />
    </Frame>
  );
}

function AuroraGlassThumb(): React.JSX.Element {
  return (
    <Frame>
      <defs>
        <radialGradient id="aurora-a" cx="25%" cy="25%" r="55%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.7} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="aurora-b" cx="80%" cy="80%" r="55%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.55} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* Blurred radial accent blobs. */}
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#aurora-a)" />
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#aurora-b)" />
      {/* Frosted-glass panel. */}
      <rect
        x={18}
        y={14}
        width={60}
        height={26}
        rx={6}
        fill={FG}
        fillOpacity={0.06}
        stroke={ACCENT}
        strokeOpacity={0.45}
        strokeWidth={0.8}
      />
      <circle cx={27} cy={27} r={4.5} fill={ACCENT} />
      <rect x={37} y={23} width={32} height={3} rx={1.5} fill={FG} fillOpacity={0.85} />
      <rect x={37} y={29} width={22} height={3} rx={1.5} fill={FG} fillOpacity={0.5} />
    </Frame>
  );
}

function BentoThumb(): React.JSX.Element {
  return (
    <Frame>
      <defs>
        <radialGradient id="bento-glow" cx="50%" cy="0%" r="85%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.32} />
          <stop offset="60%" stopColor={ACCENT} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#bento-glow)" />
      {/* Spotlight panel. */}
      <rect
        x={14}
        y={11}
        width={68}
        height={32}
        rx={7}
        fill={FG}
        fillOpacity={0.04}
        stroke={ACCENT}
        strokeOpacity={0.4}
        strokeWidth={0.8}
      />
      {/* Hard rounded accent chip. */}
      <rect x={20} y={18} width={16} height={16} rx={5} fill={ACCENT} />
      <rect x={42} y={20} width={32} height={4} rx={2} fill={FG} fillOpacity={0.85} />
      <rect x={42} y={28} width={24} height={4} rx={2} fill={FG} fillOpacity={0.5} />
    </Frame>
  );
}

function TerminalThumb(): React.JSX.Element {
  const cell = 8;
  const xs = Array.from({ length: Math.ceil(VB_W / cell) + 1 }, (_, i) => i * cell);
  const ys = Array.from({ length: Math.ceil(VB_H / cell) + 1 }, (_, i) => i * cell);
  return (
    <Frame>
      {/* Fine drafting grid. */}
      {xs.map((x) => (
        <line
          key={`v${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={VB_H}
          stroke={ACCENT}
          strokeOpacity={0.12}
          strokeWidth={0.4}
        />
      ))}
      {ys.map((y) => (
        <line
          key={`h${y}`}
          x1={0}
          y1={y}
          x2={VB_W}
          y2={y}
          stroke={ACCENT}
          strokeOpacity={0.12}
          strokeWidth={0.4}
        />
      ))}
      {/* Monospace index + cursor + data lines. */}
      <text x={9} y={24} fill={ACCENT} fontSize={11} fontFamily="'JetBrains Mono', monospace">
        01
      </text>
      <rect x={26} y={15} width={5} height={11} fill={ACCENT} fillOpacity={0.7} />
      <rect x={9} y={32} width={46} height={3} rx={0.5} fill={FG} fillOpacity={0.75} />
      <rect x={9} y={39} width={32} height={3} rx={0.5} fill={FG} fillOpacity={0.45} />
    </Frame>
  );
}

const THUMBS: Partial<Record<LongformSkinId, () => React.JSX.Element>> = {
  editorial: EditorialThumb,
  'aurora-glass': AuroraGlassThumb,
  bento: BentoThumb,
  terminal: TerminalThumb,
};

export interface SkinThumbnailProps {
  skin: LongformSkinId;
  className?: string;
}

/** Static SVG mock tile approximating a long-form skin's aesthetic. */
export function SkinThumbnail({ skin, className }: SkinThumbnailProps): React.JSX.Element {
  const Thumb = THUMBS[skin];
  return <span className={className}>{Thumb ? <Thumb /> : null}</span>;
}

export default SkinThumbnail;
