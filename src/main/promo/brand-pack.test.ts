import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
  it('ships template assets for all Promo Mode evidence categories', () => {
    const pack = buildDefaultBrandPack();
    const cats = new Set(pack.assets.map((a) => a.category));
    expect(cats.has('app-ui')).toBe(true);
    expect(cats.has('community-proof')).toBe(true);
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
      'promo-repurpose-stack',
      'promo-brand-score',
      'promo-content-calendar',
      'promo-platform-export',
      'promo-hook-test',
      'promo-before-after',
      'promo-analytics-spike',
      'promo-caption-sync',
      'promo-testimonial-card',
      'promo-approval-flow',
      'promo-brand-kit-scan',
      'promo-content-lottery',
    ]);
    for (const a of pack.assets) {
      const templateId = a.templateId ?? '';
      expect(implemented.has(templateId)).toBe(true);
      expect(existsSync(join(__dirname, '../hyperframes/catalog', `${templateId}.html`))).toBe(
        true,
      );
    }
  });

  it('ships all 16 Promo Mode templates in their expected categories', () => {
    const pack = buildDefaultBrandPack();
    const expected: Record<string, string> = {
      'promo-agent-toast': 'app-ui',
      'promo-chat-exchange': 'app-ui',
      'promo-publish': 'app-ui',
      'promo-feature-flash': 'app-ui',
      'promo-repurpose-stack': 'app-ui',
      'promo-brand-score': 'app-ui',
      'promo-content-calendar': 'app-ui',
      'promo-platform-export': 'app-ui',
      'promo-hook-test': 'app-ui',
      'promo-before-after': 'app-ui',
      'promo-analytics-spike': 'growth-stat',
      'promo-caption-sync': 'app-ui',
      'promo-testimonial-card': 'community-proof',
      'promo-approval-flow': 'app-ui',
      'promo-brand-kit-scan': 'app-ui',
      'promo-content-lottery': 'app-ui',
    };
    const assets = new Map(pack.assets.map((asset) => [asset.templateId, asset]));
    expect(Object.keys(expected)).toHaveLength(16);
    for (const [templateId, category] of Object.entries(expected)) {
      expect(assets.get(templateId)?.category).toBe(category);
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
    // CTA remains capture-only in the default pack.
    expect(resolver.resolve(beat('cta', 3))).toBeNull();
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
    const beats = [beat('app-ui', 3), beat('community-proof', 7), beat('cta', 9)];
    const resolved = resolveEvidence(beats, pack);
    expect(resolved).toHaveLength(2);
    expect(resolved.map((item) => item.beat.category)).toEqual(['app-ui', 'community-proof']);
  });
});
