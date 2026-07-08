// ---------------------------------------------------------------------------
// Promo Mode — Brand Pack
// ---------------------------------------------------------------------------
//
// A Brand Pack is the pool of evidence assets Promo Mode draws from. Two kinds:
//
//   • template — a re-textable animated Media Master component (Remotion),
//     referenced by `templateId`. Text comes from the evidence beat.
//   • capture  — a real screenshot / screen recording (mediaPath), e.g. the
//     Skool About page for the CTA, or the actual MM chat UI.
//
// Each asset declares which EvidenceCategory it satisfies and a default display
// treatment (matching the "face stays on screen" design intent). The default
// pack ships template families + CTA slot; real captures are added by the user
// dropping files into the pack folder (indexed via the image-library elsewhere).
//
// This module is split into PURE logic (default pack, beat→asset resolution)
// and a thin fs loader so the core is unit-testable without disk access.
// ---------------------------------------------------------------------------

import type { BRollDisplayMode } from '../broll-placement';
import type { EvidenceBeat, EvidenceCategory } from './evidence-trigger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidenceAssetKind = 'template' | 'capture';

export interface BrandPackAsset {
  /** Stable id, unique within a pack. */
  id: string;
  kind: EvidenceAssetKind;
  /** Which evidence category this asset satisfies. */
  category: EvidenceCategory;
  /** Remotion composition id for `kind: 'template'`. */
  templateId?: string;
  /** Absolute path to the media file for `kind: 'capture'`. */
  mediaPath?: string;
  /**
   * How the asset is placed on the clip. Captures typically use split-top so
   * the speaker stays on screen; the CTA uses fullscreen. Templates render as
   * hyperframes overlays (this field is advisory for them).
   */
  display: BRollDisplayMode;
  /** Default on-screen duration in seconds. */
  durationSeconds: number;
  /** Freeform tags for semantic capture selection (image-library). */
  tags: string[];
}

export interface BrandPack {
  /** Skool About-page capture used as the forced end CTA (if provided). */
  ctaAssetId: string | null;
  assets: BrandPackAsset[];
}

// ---------------------------------------------------------------------------
// Per-category display defaults (design intent: evidence feels incidental)
// ---------------------------------------------------------------------------

export const CATEGORY_DISPLAY_DEFAULTS: Record<EvidenceCategory, BRollDisplayMode> = {
  // App UI needs to be seen — quick fullscreen flash.
  'app-ui': 'fullscreen',
  // Proof supports you talking — keep your face on screen.
  'community-proof': 'split-top',
  // Stats are animated hyperframes on top of the speaker.
  'growth-stat': 'pip',
  // The one allowed "ad" moment — fullscreen at the end.
  cta: 'fullscreen',
};

export const CATEGORY_DURATION_DEFAULTS: Record<EvidenceCategory, number> = {
  'app-ui': 2.0,
  'community-proof': 2.5,
  'growth-stat': 2.5,
  cta: 3.5,
};

// ---------------------------------------------------------------------------
// Default pack — template families (HyperFrames catalog widgets)
// ---------------------------------------------------------------------------
//
// A template's `templateId` is a HyperFrames block name (catalog/<block>.html).
// The Promo orchestrator renders these as overlay pop-ups via the existing
// hyperframes-overlay feature. Only IMPLEMENTED blocks are shipped in the
// default pack so every resolved beat actually renders.
//
// Implemented today:
//   • promo-agent-toast    — MM "agent did X" success toast (re-textable)
//   • promo-chat-exchange  — user prompt → agent reply chat bubbles
//   • promo-publish        — 9 platform icons lighting up sequentially
//   • promo-feature-flash  — icon + title + one-line feature callout
//   • big-stat             — existing widget, reused for growth stats
// ---------------------------------------------------------------------------

export const PROMO_TEMPLATE_IDS = {
  /** Implemented: catalog/promo-agent-toast.html */
  agentSuccessToast: 'promo-agent-toast',
  /** Reuses the existing catalog/big-stat.html widget. */
  growthStat: 'big-stat',
  /** Implemented: catalog/promo-chat-exchange.html */
  chatExchange: 'promo-chat-exchange',
  /** Implemented: catalog/promo-publish.html */
  publishToPlatforms: 'promo-publish',
  /** Implemented: catalog/promo-feature-flash.html */
  featureFlash: 'promo-feature-flash',
} as const;

function template(
  id: string,
  category: EvidenceCategory,
  templateId: string,
  tags: string[],
): BrandPackAsset {
  return {
    id,
    kind: 'template',
    category,
    templateId,
    display: CATEGORY_DISPLAY_DEFAULTS[category],
    durationSeconds: CATEGORY_DURATION_DEFAULTS[category],
    tags,
  };
}

/**
 * The built-in pack. Ships the animated template families for every
 * non-capture category. `ctaAssetId` is null until the user adds a Skool
 * About-page capture (or a CTA template is registered).
 */
export function buildDefaultBrandPack(): BrandPack {
  return {
    ctaAssetId: null,
    assets: [
      template('tpl-agent-toast', 'app-ui', PROMO_TEMPLATE_IDS.agentSuccessToast, [
        'agent',
        'success',
        'toast',
        'generated',
        'posted',
        'done',
      ]),
      template('tpl-growth-stat', 'growth-stat', PROMO_TEMPLATE_IDS.growthStat, [
        'stat',
        'growth',
        'number',
        'posts a month',
        'followers',
        'reach',
      ]),
      template('tpl-chat-exchange', 'app-ui', PROMO_TEMPLATE_IDS.chatExchange, [
        'chat',
        'prompt',
        'reply',
        'wrote',
        'captions',
        'tone',
      ]),
      template('tpl-publish', 'app-ui', PROMO_TEMPLATE_IDS.publishToPlatforms, [
        'publish',
        'platforms',
        'post',
        'schedule',
        'distribute',
        'channels',
      ]),
      template('tpl-feature-flash', 'app-ui', PROMO_TEMPLATE_IDS.featureFlash, [
        'feature',
        'swipe ads',
        'image library',
        'ads dashboard',
        'callout',
        'highlight',
      ]),
    ],
  };
}

// ---------------------------------------------------------------------------
// Beat → asset resolution (pure)
// ---------------------------------------------------------------------------

export interface ResolvedEvidence {
  beat: EvidenceBeat;
  asset: BrandPackAsset;
}

/**
 * Round-robin cursor per category so repeated beats of the same category cycle
 * through available assets instead of always picking the first one — keeps a
 * feed from looking identical across many shorts.
 */
export class BrandPackResolver {
  private byCategory: Map<EvidenceCategory, BrandPackAsset[]>;
  private cursor: Map<EvidenceCategory, number> = new Map();

  constructor(private pack: BrandPack) {
    this.byCategory = new Map();
    for (const asset of pack.assets) {
      const list = this.byCategory.get(asset.category) ?? [];
      list.push(asset);
      this.byCategory.set(asset.category, list);
    }
  }

  /** Resolve one beat to a concrete asset, or null when none matches. */
  resolve(beat: EvidenceBeat): BrandPackAsset | null {
    const list = this.byCategory.get(beat.category);
    if (!list || list.length === 0) return null;
    const i = this.cursor.get(beat.category) ?? 0;
    this.cursor.set(beat.category, (i + 1) % list.length);
    return list[i] ?? null;
  }

  /** The forced end-CTA asset, or null when the pack has no CTA. */
  ctaAsset(): BrandPackAsset | null {
    const ctaId = this.pack.ctaAssetId;
    if (!ctaId) return null;
    return this.pack.assets.find((a) => a.id === ctaId) ?? null;
  }
}

/** Resolve a list of beats to evidence, dropping beats with no matching asset. */
export function resolveEvidence(beats: EvidenceBeat[], pack: BrandPack): ResolvedEvidence[] {
  const resolver = new BrandPackResolver(pack);
  const out: ResolvedEvidence[] = [];
  for (const beat of beats) {
    const asset = resolver.resolve(beat);
    if (asset) out.push({ beat, asset });
  }
  return out;
}
