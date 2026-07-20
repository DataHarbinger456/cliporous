import type { WordTimestamp } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { type BrandPack, buildDefaultBrandPack } from './brand-pack';
import type { EvidenceBeat } from './evidence-trigger';
import { buildPromoEvidencePlan } from './promo-mode';

function words(texts: string[], spw = 0.4): WordTimestamp[] {
  return texts.map((text, i) => ({ text, start: i * spw, end: (i + 1) * spw }));
}

/** A pack with a Skool About-page CTA capture. */
function packWithCta(): BrandPack {
  const base = buildDefaultBrandPack();
  return {
    ctaAssetId: 'cta-skool',
    assets: [
      ...base.assets,
      {
        id: 'cta-skool',
        kind: 'capture',
        category: 'cta',
        mediaPath: '/tmp/skool-about.png',
        // Skool CTA floats as a rounded card over the speaker (bottom half).
        display: 'floating-card',
        durationSeconds: 3.5,
        tags: ['skool', 'cta'],
      },
    ],
  };
}

describe('promo-mode — evidence plan', () => {
  it('emits a template overlay for an app-ui beat', () => {
    const beats: EvidenceBeat[] = [
      { category: 'app-ui', timestamp: 4, textFill: 'generated 15 images' },
    ];
    const plan = buildPromoEvidencePlan(words(['a']), 20, buildDefaultBrandPack(), {
      beats,
      forceCta: false,
    });
    expect(plan.templateOverlays).toHaveLength(1);
    expect(plan.templateOverlays[0].block).toBe('promo-agent-toast');
    expect(plan.templateOverlays[0].props.text).toBe('generated 15 images');
    expect(plan.templateOverlays[0].timing.start).toBe(4);
  });

  it('forces the Skool CTA capture onto the clip end', () => {
    const plan = buildPromoEvidencePlan(words(['a']), 20, packWithCta(), {
      beats: [],
      forceCta: true,
    });
    const cta = plan.capturePlacements.find((p) => p.isCta);
    if (!cta) throw new Error('expected a forced CTA placement');
    expect(cta.assetId).toBe('cta-skool');
    // The forced CTA carries the asset's own display mode (not hardcoded).
    expect(cta.display).toBe('floating-card');
    // Ends at (or just before) the clip end.
    expect(cta.startTime + cta.duration).toBeLessThanOrEqual(20);
    expect(cta.startTime + cta.duration).toBeGreaterThan(20 - 4);
  });

  it('does not force a CTA when the pack has none', () => {
    const plan = buildPromoEvidencePlan(words(['a']), 20, buildDefaultBrandPack(), {
      beats: [],
      forceCta: true,
    });
    expect(plan.capturePlacements.filter((p) => p.isCta)).toHaveLength(0);
  });

  it('drops mid-clip CTA beats (only the forced end CTA shows)', () => {
    const beats: EvidenceBeat[] = [{ category: 'cta', timestamp: 5 }];
    const plan = buildPromoEvidencePlan(words(['a']), 20, packWithCta(), {
      beats,
      forceCta: true,
    });
    // Exactly one CTA — the forced end one, not the mid-clip beat.
    expect(plan.capturePlacements.filter((p) => p.isCta)).toHaveLength(1);
    expect(plan.capturePlacements[plan.capturePlacements.length - 1].isCta).toBe(true);
  });

  it('clamps overlay duration to the clip end', () => {
    // 1.2s of room — shorter than the 2.5s default, so it clamps to the end.
    const beats: EvidenceBeat[] = [{ category: 'app-ui', timestamp: 18.8, textFill: 'x' }];
    const plan = buildPromoEvidencePlan(words(['a']), 20, buildDefaultBrandPack(), {
      beats,
      forceCta: false,
    });
    expect(plan.templateOverlays).toHaveLength(1);
    const t = plan.templateOverlays[0].timing;
    expect(t.start + t.duration).toBeLessThanOrEqual(20 + 1e-9);
  });

  it('drops a mid-clip pop with too little room at the clip end', () => {
    // 0.5s of room — below MIN_USEFUL_DURATION, so no sliver overlay.
    const beats: EvidenceBeat[] = [{ category: 'app-ui', timestamp: 19.5, textFill: 'x' }];
    const plan = buildPromoEvidencePlan(words(['a']), 20, buildDefaultBrandPack(), {
      beats,
      forceCta: false,
    });
    expect(plan.templateOverlays).toHaveLength(0);
  });

  it('orders placements ascending by start time', () => {
    const pack = packWithCta();
    const beats: EvidenceBeat[] = [
      { category: 'growth-stat', timestamp: 10, textFill: '100' },
      { category: 'app-ui', timestamp: 4, textFill: 'toast' },
    ];
    const plan = buildPromoEvidencePlan(words(['a']), 30, pack, { beats });
    const starts = plan.templateOverlays.map((o) => o.timing.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});
