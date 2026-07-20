/**
 * Maps an `Archetype` (per active edit style) to a Remotion composition id.
 * `segment-render.ts` consults this before falling back to its FFmpeg path.
 *
 * Currently only PRESTYJ ships Remotion versions — the resolver is keyed on
 * (editStyleId, archetype) so other styles can opt in incrementally.
 */

import type { LongformBlockKind, LongformSkinId } from '@shared/types';
import type { Archetype } from '../edit-styles/shared/archetypes';

export interface RemotionCompositionRef {
  /** Composition id registered in Root.tsx. */
  compositionId: string;
  /** Whether this composition needs an `imagePath` prop. */
  needsImage: boolean;
}

const PRESTYJ_MAP: Partial<Record<Archetype, RemotionCompositionRef>> = {
  'fullscreen-quote': {
    compositionId: 'FullscreenQuote',
    needsImage: false,
  },
  // 'fullscreen-quote-plus-broll' is not in the canonical Archetype list yet.
  // When we add it as a new archetype, plug it here. For now,
  // FullscreenQuotePlusBroll is reachable only via direct render calls
  // (e.g. for the curiosity-gap or hook moments).
  'split-image': {
    compositionId: 'FullscreenQuotePlusBroll',
    needsImage: true,
  },
};

const STYLE_MAPS: Record<string, Partial<Record<Archetype, RemotionCompositionRef>>> = {
  prestyj: PRESTYJ_MAP,
};

export function resolveRemotionComposition(
  editStyleId: string | undefined,
  archetype: Archetype | undefined,
): RemotionCompositionRef | null {
  if (!editStyleId || !archetype) return null;
  const map = STYLE_MAPS[editStyleId];
  return map?.[archetype] ?? null;
}

// ---------------------------------------------------------------------------
// Long-form content blocks — skinned full-frame data graphics
//
// The 17 block compositions in `Root.tsx` are registered with id
// `` `${BaseName}-${skinId}` `` (e.g. `BarChart-editorial`). The resolver below
// reconstructs that id from a `(kind, skinId)` pair so the render feature can
// `selectComposition` the right block without hard-coding strings.
// ---------------------------------------------------------------------------

/**
 * Maps each block kind to its PascalCase base composition name.
 *
 * Exported so verification harnesses (scripts/verify-blocks) can enumerate the
 * full block set without re-declaring it — keeping the QA grid in sync as
 * blocks are added or removed here.
 */
export const LONGFORM_BLOCK_BASE: Record<LongformBlockKind, string> = {
  'bar-chart': 'BarChart',
  comparison: 'Comparison',
  'comparison-table': 'ComparisonTable',
  'stat-grid': 'StatGrid',
  'icon-stat-grid': 'IconStatGrid',
  'icon-row': 'IconRow',
  'numbered-list': 'NumberedList',
  checklist: 'Checklist',
  'stat-hero': 'StatHero',
  'progress-bars': 'ProgressBars',
  'kpi-ticker': 'KpiTicker',
  'quote-card': 'QuoteCard',
  'portrait-quote': 'PortraitQuote',
  'tweet-card': 'TweetCard',
  'definition-card': 'DefinitionCard',
  timeline: 'Timeline',
  'timeline-cards': 'TimelineCards',
  'feature-grid': 'FeatureGrid',
  leaderboard: 'Leaderboard',
  donut: 'Donut',
  funnel: 'Funnel',
  callout: 'Callout',
  map: 'MapBlock',
};

/**
 * Default skin for long-form blocks — one skin per video keeps the edit
 * visually coherent and the AI contract small. Editorial is chosen for
 * legibility; this can be promoted to a user setting later.
 */
export const DEFAULT_LONGFORM_BLOCK_SKIN: LongformSkinId = 'editorial';

/**
 * Resolve a `(kind, skinId)` pair to the registered Remotion composition id
 * (`` `${BaseName}-${skinId}` ``), matching the ids registered in `Root.tsx`.
 */
export function resolveLongformBlockCompositionId(
  kind: LongformBlockKind,
  skinId: LongformSkinId,
): string {
  return `${LONGFORM_BLOCK_BASE[kind]}-${skinId}`;
}
