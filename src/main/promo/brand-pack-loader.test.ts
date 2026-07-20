import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BrandPackResolver, buildDefaultBrandPack } from './brand-pack';
import {
  type BrandPackManifest,
  mergeBrandPack,
  mergeRuntimeBrandPack,
  SEED_MANIFEST,
} from './brand-pack-loader';

describe('brand-pack-loader — mergeBrandPack', () => {
  it('returns the default (template-only) pack when manifest is null', () => {
    const pack = mergeBrandPack(null, '/packs/assets');
    expect(pack.ctaAssetId).toBeNull();
    expect(pack.assets.every((a) => a.kind === 'template')).toBe(true);
  });

  it('appends captures and resolves relative media paths against assetsDir', () => {
    const manifest: BrandPackManifest = {
      captures: [
        { id: 'skool-about', category: 'cta', mediaPath: 'skool-about.png' },
        { id: 'members', category: 'community-proof', mediaPath: '/abs/members.png' },
      ],
    };
    const pack = mergeBrandPack(manifest, '/packs/assets');
    const skool = pack.assets.find((a) => a.id === 'skool-about');
    const members = pack.assets.find((a) => a.id === 'members');
    expect(skool?.mediaPath).toBe('/packs/assets/skool-about.png');
    expect(members?.mediaPath).toBe('/abs/members.png'); // absolute kept as-is
    // Templates are preserved alongside captures.
    expect(pack.assets.some((a) => a.kind === 'template')).toBe(true);
  });

  it('honors a ctaAssetId only when it matches a real capture', () => {
    const good: BrandPackManifest = {
      ctaAssetId: 'skool-about',
      captures: [{ id: 'skool-about', category: 'cta', mediaPath: 'x.png' }],
    };
    expect(mergeBrandPack(good, '/a').ctaAssetId).toBe('skool-about');

    const dangling: BrandPackManifest = {
      ctaAssetId: 'missing',
      captures: [{ id: 'skool-about', category: 'cta', mediaPath: 'x.png' }],
    };
    expect(mergeBrandPack(dangling, '/a').ctaAssetId).toBeNull();
  });

  // The first-run scaffold writes SEED_MANIFEST to disk. It must resolve to a
  // working Skool CTA the moment the user drops skool-about.png — this is the
  // promo funnel's payoff, so guard the seed wiring directly. The CTA floats as
  // a rounded card over the speaker (category default 'floating-card').
  it('SEED_MANIFEST resolves to a floating-card Skool CTA when merged', () => {
    const pack = mergeBrandPack(SEED_MANIFEST, '/packs/assets');
    expect(pack.ctaAssetId).toBe('skool-about');

    const cta = new BrandPackResolver(pack).ctaAsset();
    expect(cta).not.toBeNull();
    expect(cta?.category).toBe('cta');
    expect(cta?.display).toBe('floating-card');
    expect(cta?.mediaPath).toBe('/packs/assets/skool-about.png');
  });

  it('merges available Creator Profile captures and designates their CTA', () => {
    const mediaPath = fileURLToPath(import.meta.url);
    const pack = mergeRuntimeBrandPack(
      buildDefaultBrandPack(),
      [
        { id: 'profile-proof', category: 'community-proof', mediaPath },
        { id: 'profile-cta', category: 'cta', mediaPath },
      ],
      'profile-cta',
    );

    expect(pack.ctaAssetId).toBe('profile-cta');
    expect(pack.assets.find((asset) => asset.id === 'profile-proof')).toMatchObject({
      kind: 'capture',
      display: 'floating-card',
      mediaPath,
    });
  });

  it('applies display + duration overrides, falling back to defaults', () => {
    const manifest: BrandPackManifest = {
      captures: [
        {
          id: 'a',
          category: 'app-ui',
          mediaPath: 'a.png',
          display: 'pip',
          durationSeconds: 4,
          tags: ['chat'],
        },
        { id: 'b', category: 'community-proof', mediaPath: 'b.png' },
      ],
    };
    const pack = mergeBrandPack(manifest, '/a');
    const a = pack.assets.find((x) => x.id === 'a');
    const b = pack.assets.find((x) => x.id === 'b');
    expect(a?.display).toBe('pip');
    expect(a?.durationSeconds).toBe(4);
    expect(a?.tags).toEqual(['chat']);
    expect(b?.display).toBe('floating-card'); // community-proof category default
    expect(b?.durationSeconds).toBe(2.5); // fallback
  });
});
