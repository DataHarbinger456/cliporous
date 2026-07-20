import { BUILTIN_PALETTES, type Palette } from '@shared/palettes';
import type { LongformSkinId } from '@shared/types';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_PALETTE = BUILTIN_PALETTES[0] as Palette;

export const LONGFORM_SKINS: ReadonlyArray<{
  id: LongformSkinId;
  label: string;
  description: string;
}> = [
  { id: 'editorial', label: 'Editorial', description: 'Open grid and oversized index' },
  {
    id: 'print-magazine',
    label: 'Print Magazine',
    description: 'Framed columns and serif details',
  },
  {
    id: 'neo-brutalist',
    label: 'Neo Brutalist',
    description: 'Hard borders and offset shapes',
  },
  { id: 'blueprint', label: 'Blueprint', description: 'Drafting grid and technical labels' },
  { id: 'aurora-glass', label: 'Aurora Glass', description: 'Soft light and a glass panel' },
  { id: 'bento', label: 'Bento', description: 'Focused card with a bold chip' },
  { id: 'terminal', label: 'Terminal', description: 'Monospace data panel' },
];

function headlineTokens(value: string): Array<{ key: string; text: string }> {
  return Array.from(value.matchAll(/\S+\s*/g), (match) => ({
    key: `${match.index ?? 0}-${match[0].trim()}`,
    text: match[0],
  }));
}

interface SkinContentProps {
  skin: LongformSkinId;
  palette: Palette;
  kicker: string;
  headline: string;
}

function SkinContent({ skin, palette, kicker, headline }: SkinContentProps): React.JSX.Element {
  const sharedCopy = (
    <span className="relative z-10 flex min-w-0 flex-1 flex-col justify-center">
      <span
        className={cn(
          'truncate text-[clamp(6px,3.8cqw,11px)] font-semibold uppercase tracking-[0.16em] opacity-75',
          (skin === 'terminal' || skin === 'blueprint') && 'font-mono',
          skin === 'print-magazine' && 'font-serif normal-case italic tracking-normal',
        )}
      >
        {kicker}
      </span>
      <span
        className={cn(
          'mt-[3%] line-clamp-2 text-[clamp(9px,7cqw,22px)] font-semibold leading-[1.02] tracking-tight',
          skin === 'terminal' && 'font-mono uppercase tracking-normal',
          skin === 'print-magazine' && 'font-serif font-normal',
          skin === 'neo-brutalist' && 'uppercase tracking-[-0.03em]',
        )}
      >
        {headlineTokens(headline).map((token) => (
          <span key={token.key} className="contents">
            {token.text}
          </span>
        ))}
      </span>
    </span>
  );

  if (skin === 'editorial') {
    return (
      <>
        <span
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent 24%, ${palette.foreground} 25%, transparent 26%, transparent 49%, ${palette.foreground} 50%, transparent 51%, transparent 74%, ${palette.foreground} 75%, transparent 76%)`,
          }}
        />
        <span
          className="relative z-10 mr-[7%] font-display text-[clamp(20px,18cqw,56px)] leading-none"
          style={{ color: palette.accent }}
        >
          01
        </span>
        {sharedCopy}
      </>
    );
  }

  if (skin === 'print-magazine') {
    return (
      <span
        className="relative z-10 flex h-[76%] w-[86%] items-center gap-[7%] border-y-[3px] border-double px-[6%]"
        style={{ borderColor: `${palette.foreground}66` }}
      >
        <span
          className="font-serif text-[clamp(17px,15cqw,44px)] italic"
          style={{ color: palette.accent }}
        >
          1
        </span>
        {sharedCopy}
      </span>
    );
  }

  if (skin === 'neo-brutalist') {
    return (
      <>
        <span
          className="absolute -right-[5%] -top-[25%] h-[72%] w-[32%] border-[3px]"
          style={{ backgroundColor: palette.accent, borderColor: palette.foreground }}
        />
        <span
          className="relative z-10 flex w-[82%] items-center gap-[7%] border-[3px] p-[6%]"
          style={{
            backgroundColor: palette.background,
            borderColor: palette.foreground,
            boxShadow: `clamp(3px,2.4cqw,8px) clamp(3px,2.4cqw,8px) 0 ${palette.accent}`,
          }}
        >
          <span
            className="flex aspect-square w-[18%] shrink-0 items-center justify-center text-[clamp(8px,6cqw,18px)] font-bold"
            style={{ backgroundColor: palette.accent, color: palette.background }}
          >
            01
          </span>
          {sharedCopy}
        </span>
      </>
    );
  }

  if (skin === 'blueprint') {
    return (
      <>
        <span
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `linear-gradient(${palette.accent} 1px, transparent 1px), linear-gradient(90deg, ${palette.accent} 1px, transparent 1px)`,
            backgroundSize: '10% 18%',
          }}
        />
        <span
          className="relative z-10 flex w-[84%] items-center gap-[7%] border p-[6%]"
          style={{ borderColor: palette.accent }}
        >
          <span className="font-mono text-[clamp(8px,6cqw,18px)]" style={{ color: palette.accent }}>
            A.01
          </span>
          {sharedCopy}
        </span>
      </>
    );
  }

  if (skin === 'aurora-glass') {
    return (
      <>
        <span
          className="absolute -left-[18%] -top-[55%] h-[150%] w-[70%] rounded-full blur-xl"
          style={{ backgroundColor: `${palette.accent}88` }}
        />
        <span
          className="absolute -bottom-[65%] -right-[15%] h-[140%] w-[65%] rounded-full blur-xl"
          style={{ backgroundColor: `${palette.accent2 ?? palette.accent}77` }}
        />
        <span
          className="relative z-10 flex w-[78%] items-center gap-[7%] rounded-[clamp(6px,2cqw,18px)] border p-[7%] backdrop-blur-sm"
          style={{
            backgroundColor: `${palette.background}B8`,
            borderColor: `${palette.accent}88`,
          }}
        >
          <span
            className="h-[clamp(8px,7cqw,22px)] w-[clamp(8px,7cqw,22px)] shrink-0 rounded-full"
            style={{ backgroundColor: palette.accent }}
          />
          {sharedCopy}
        </span>
      </>
    );
  }

  if (skin === 'bento') {
    return (
      <span
        className="relative z-10 flex w-[78%] items-center gap-[7%] rounded-[clamp(7px,2cqw,20px)] border p-[7%]"
        style={{
          borderColor: `${palette.accent}88`,
          background: `radial-gradient(110% 150% at 50% 0%, ${palette.accent}33, ${palette.background}F0 64%)`,
        }}
      >
        <span
          className="flex aspect-square w-[19%] shrink-0 items-center justify-center rounded-[28%] text-[clamp(7px,5cqw,16px)] font-bold"
          style={{ backgroundColor: palette.accent, color: palette.background }}
        >
          01
        </span>
        {sharedCopy}
      </span>
    );
  }

  return (
    <>
      <span
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: `linear-gradient(${palette.accent} 1px, transparent 1px), linear-gradient(90deg, ${palette.accent} 1px, transparent 1px)`,
          backgroundSize: '9% 16%',
        }}
      />
      <span
        className="relative z-10 flex w-[80%] items-center gap-[7%] rounded-sm border p-[6%]"
        style={{ borderColor: `${palette.accent}99`, backgroundColor: `${palette.background}E8` }}
      >
        <span className="font-mono text-[clamp(8px,6cqw,18px)]" style={{ color: palette.accent }}>
          01_
        </span>
        {sharedCopy}
      </span>
    </>
  );
}

export interface SkinThumbnailProps {
  skin: LongformSkinId;
  palette?: Palette;
  headline?: string;
  kicker?: string;
  posterUrl?: string | null;
  className?: string;
}

/**
 * Responsive static approximation of the real Remotion skin. Palette colors and
 * supplied project copy stay literal; a source poster is contextual evidence, not
 * a claim that speaker footage remains behind every full-frame block.
 */
export function SkinThumbnail({
  skin,
  palette = DEFAULT_PALETTE,
  headline = 'A stronger story starts here',
  kicker = 'Project preview',
  posterUrl,
  className,
}: SkinThumbnailProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'relative isolate flex aspect-video w-full items-center justify-center overflow-hidden [container-type:inline-size]',
        className,
      )}
      style={{ backgroundColor: palette.background, color: palette.foreground }}
      aria-hidden="true"
    >
      {posterUrl && (
        <>
          <img
            src={posterUrl}
            alt=""
            draggable={false}
            className="absolute inset-y-0 right-0 h-full w-[38%] object-cover opacity-45"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
          <span
            className="absolute inset-0"
            style={{
              background: `linear-gradient(90deg, ${palette.background} 42%, ${palette.background}D9 64%, transparent 100%)`,
            }}
          />
        </>
      )}
      <SkinContent skin={skin} palette={palette} kicker={kicker} headline={headline} />
    </span>
  );
}

export default SkinThumbnail;
