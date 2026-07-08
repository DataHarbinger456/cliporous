import { describe, expect, it } from 'vitest';
import {
  type BrandPack,
  BrandPackResolver,
  buildDefaultBrandPack,
  CATEGORY_DISPLAY_DEFAULTS,
  resolveEvidence,
} from './brand-pack';
import type { EvidenceBeat } from './evidence-trigger';

function beat(category: EvidenceBeat['category'], timestamp: number): EvidenceBeat {
  return { category, timestamp };
}

describe('brand-pack — default pack', () => {
  it('ships template assets for app-ui and growth-stat', () => {
    const pack = buildDefaultBrandPack();
    const cats = new Set(pack.assets.map((a) => a.category));
    expect(cats.has('app-ui')).toBe(true);
    expect(cats.has('growth-stat')).toBe(true);
    expect(pack.assets.every((a) => a.kind === 'template')).toBe(true);
  });

  it('only ships templates whose HyperFrames block is implemented', () => {
    const pack = buildDefaultBrandPack();
    const implemented = new Set([
      'promo-agent-toast',
      'promo-chat-exchange',
      'promo-publish',
      'promo-feature-flash',
      'big-stat',
    ]);
    for (const a of pack.assets) {
      expect(implemented.has(a.templateId ?? '')).toBe(true);
    }
  });

  it('applies category display defaults to each asset', () => {
    const pack = buildDefaultBrandPack();
    for (const a of pack.assets) {
      expect(a.display).toBe(CATEGORY_DISPLAY_DEFAULTS[a.category]);
    }
  });

  it('has no CTA asset by default (user adds the Skool capture)', () => {
    expect(buildDefaultBrandPack().ctaAssetId).toBeNull();
  });
});

describe('brand-pack — resolver', () => {
  it('round-robins repeated beats of the same category', () => {
    const pack: BrandPack = {
      ctaAssetId: null,
      assets: ['a', 'b', 'c'].map((id) => ({
        id,
        kind: 'template' as const,
        category: 'app-ui' as const,
        templateId: 'promo-agent-toast',
        display: 'fullscreen' as const,
        durationSeconds: 2,
        tags: [],
      })),
    };
    const resolver = new BrandPackResolver(pack);
    // 3 assets → 4 resolves cycle back to the first.
    const ids = Array.from({ length: 4 }, () => resolver.resolve(beat('app-ui', 3))?.id);
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    expect(ids[3]).toBe(ids[0]);
  });

  it('returns null for a category with no assets', () => {
    const pack = buildDefaultBrandPack();
    const resolver = new BrandPackResolver(pack);
    // community-proof has no template in the default pack (capture-only).
    expect(resolver.resolve(beat('community-proof', 3))).toBeNull();
  });

  it('resolves the forced CTA asset when present', () => {
    const pack: BrandPack = {
      ctaAssetId: 'cta-skool',
      assets: [
        {
          id: 'cta-skool',
          kind: 'capture',
          category: 'cta',
          mediaPath: '/tmp/skool-about.png',
          display: 'fullscreen',
          durationSeconds: 3.5,
          tags: ['skool', 'cta'],
        },
      ],
    };
    expect(new BrandPackResolver(pack).ctaAsset()?.id).toBe('cta-skool');
  });

  it('drops beats with no matching asset in resolveEvidence', () => {
    const pack = buildDefaultBrandPack();
    const beats = [beat('app-ui', 3), beat('community-proof', 7)];
    const resolved = resolveEvidence(beats, pack);
    // Only app-ui resolves against the default (template-only) pack.
    expect(resolved).toHaveLength(1);
    expect(resolved[0].beat.category).toBe('app-ui');
  });
});
