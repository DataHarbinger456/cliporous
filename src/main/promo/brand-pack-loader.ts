// ---------------------------------------------------------------------------
// Promo Mode — Brand Pack loader
// ---------------------------------------------------------------------------
//
// Loads the user's Brand Pack from disk and merges it with the built-in
// template assets. Layout (under app.getPath('userData')/promo/brand-pack/):
//
//   manifest.json       — { ctaAssetId, captures: [...] }
//   assets/<file>       — capture media (screenshots / recordings)
//
// The manifest only declares CAPTURES (real screenshots / recordings) plus the
// CTA selection; the animated templates always come from buildDefaultBrandPack.
// Relative capture paths in the manifest are resolved against the pack's
// `assets/` directory. Missing / malformed manifest → default pack (templates
// only, no CTA), so Promo Mode degrades to clean talking-head + template pops.
//
// The merge is pure (mergeBrandPack) so it is unit-tested without disk access.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { app } from 'electron';
import type { BRollDisplayMode } from '../broll-placement';
import {
  type BrandPack,
  type BrandPackAsset,
  buildDefaultBrandPack,
  CATEGORY_DISPLAY_DEFAULTS,
} from './brand-pack';
import type { EvidenceCategory } from './evidence-trigger';

// ---------------------------------------------------------------------------
// Manifest shape (on disk)
// ---------------------------------------------------------------------------

export interface BrandPackManifestCapture {
  id: string;
  category: EvidenceCategory;
  /** Relative (to assets/) or absolute path to the media file. */
  mediaPath: string;
  /** Optional display override; defaults per category. */
  display?: BRollDisplayMode;
  /** Optional duration override in seconds. */
  durationSeconds?: number;
  tags?: string[];
}

export interface BrandPackManifest {
  /** Asset id used as the forced end CTA (must match a capture id). */
  ctaAssetId?: string | null;
  captures?: BrandPackManifestCapture[];
}

export interface RuntimeBrandPackCapture {
  id: string;
  category: EvidenceCategory;
  mediaPath: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Pure merge
// ---------------------------------------------------------------------------

/**
 * Merge a manifest's captures into the default (template-only) pack.
 *
 * @param manifest  Parsed manifest (or null → default pack unchanged).
 * @param assetsDir Absolute directory that relative capture paths resolve against.
 */
export function mergeBrandPack(manifest: BrandPackManifest | null, assetsDir: string): BrandPack {
  const base = buildDefaultBrandPack();
  if (!manifest || !Array.isArray(manifest.captures) || manifest.captures.length === 0) {
    return base;
  }

  const captures: BrandPackAsset[] = manifest.captures.map((c) => ({
    id: c.id,
    kind: 'capture' as const,
    category: c.category,
    mediaPath: isAbsolute(c.mediaPath) ? c.mediaPath : join(assetsDir, c.mediaPath),
    // No explicit display → the category's default treatment (captures for
    // cta / community-proof float as rounded cards over the speaker).
    display: c.display ?? CATEGORY_DISPLAY_DEFAULTS[c.category],
    durationSeconds: c.durationSeconds ?? 2.5,
    tags: c.tags ?? [],
  }));

  // A CTA id is honored only when it names a real capture in the manifest.
  const ctaId =
    manifest.ctaAssetId && captures.some((a) => a.id === manifest.ctaAssetId)
      ? manifest.ctaAssetId
      : null;

  return {
    ctaAssetId: ctaId,
    assets: [...base.assets, ...captures],
  };
}

/** Merge stable Creator Profile captures into the loaded disk pack for one render. */
export function mergeRuntimeBrandPack(
  pack: BrandPack,
  captures: RuntimeBrandPackCapture[] = [],
  ctaAssetId?: string,
): BrandPack {
  const runtimeAssets: BrandPackAsset[] = captures
    .filter((capture) => capture.mediaPath && existsSync(capture.mediaPath))
    .map((capture) => ({
      id: capture.id,
      kind: 'capture' as const,
      category: capture.category,
      mediaPath: capture.mediaPath,
      display: CATEGORY_DISPLAY_DEFAULTS[capture.category],
      durationSeconds: capture.category === 'cta' ? 3.5 : 2.5,
      tags: capture.tags ?? [],
    }));
  const runtimeIds = new Set(runtimeAssets.map((asset) => asset.id));
  const withoutShadowedIds = pack.assets.filter((asset) => !runtimeIds.has(asset.id));
  return {
    ctaAssetId: ctaAssetId && runtimeIds.has(ctaAssetId) ? ctaAssetId : pack.ctaAssetId,
    assets: [...withoutShadowedIds, ...runtimeAssets],
  };
}

// ---------------------------------------------------------------------------
// fs loader
// ---------------------------------------------------------------------------

/** Absolute path to the Brand Pack directory under userData. */
export function getBrandPackDir(): string {
  return join(app.getPath('userData'), 'promo', 'brand-pack');
}

// ---------------------------------------------------------------------------
// First-run scaffold
// ---------------------------------------------------------------------------
//
// On first Promo render we create the brand-pack folder and seed a working
// manifest.json wired for the ONE thing every promo needs: the Skool About-page
// CTA. The user only has to drop a single screenshot at assets/skool-about.png
// and the forced end-CTA lights up. A fuller manifest.example.json and README
// document how to add more captures (community proof, app UI).
// ---------------------------------------------------------------------------

/** Seed manifest — CTA pre-wired so dropping one PNG makes the CTA work. */
export const SEED_MANIFEST: BrandPackManifest = {
  ctaAssetId: 'skool-about',
  captures: [
    {
      id: 'skool-about',
      category: 'cta',
      mediaPath: 'skool-about.png',
      // Omit display → category default 'floating-card' (rounded card, bottom
      // half, over the speaker).
      durationSeconds: 3.5,
      tags: ['skool', 'join', 'community', 'cta'],
    },
  ],
};

/** Fuller example showing every capture category + how to add screen recordings. */
const EXAMPLE_MANIFEST: BrandPackManifest = {
  ctaAssetId: 'skool-about',
  captures: [
    {
      id: 'skool-about',
      category: 'cta',
      mediaPath: 'skool-about.png',
      display: 'fullscreen',
      durationSeconds: 3.5,
      tags: ['skool', 'join', 'community', 'cta'],
    },
    {
      id: 'skool-members',
      category: 'community-proof',
      mediaPath: 'skool-members.png',
      // floating-card by default — rounded card over you while you talk.
      durationSeconds: 2.5,
      tags: ['members', 'community', 'proof'],
    },
    {
      id: 'skool-win',
      category: 'community-proof',
      mediaPath: 'skool-win.png',
      durationSeconds: 2.5,
      tags: ['win', 'testimonial', 'result', 'proof'],
    },
    {
      id: 'mm-chat',
      category: 'app-ui',
      mediaPath: 'media-master-chat.mp4',
      display: 'floating-card',
      durationSeconds: 3,
      tags: ['media master', 'chat', 'agent', 'app'],
    },
  ],
};

const README = `# Promo Mode — Brand Pack

Drop your real screenshots / screen recordings in the \`assets/\` folder here,
then reference them from \`manifest.json\`. These are the "evidence" pop-ups that
make your talking-head claims feel legit.

## The one thing you must add

Save a screenshot of your Skool About page as:

    assets/skool-about.png

That is the forced end-CTA on every promo clip (the whole funnel: join the Skool).
The seeded manifest.json already points at it — just drop the file in.

## Categories → on-screen treatment

- **cta**             fullscreen at the clip end (Skool About page)
- **app-ui**          quick fullscreen flash (Media Master screens/recordings)
- **community-proof** split-top, your face stays on screen (members, wins)
- **growth-stat**     animated stat overlay (no capture needed — templated)

## Adding more captures

See \`manifest.example.json\` for the full shape. Each capture:

    { "id", "category", "mediaPath" (relative to assets/), "display"?, "durationSeconds"?, "tags"? }

Images are auto-converted to short Ken Burns clips; .mp4/.mov/.webm pass through.
Missing files are skipped safely (no crash) — so you can wire entries before
you've captured every asset.
`;

/**
 * Ensure the Brand Pack folder exists with a seeded manifest, example, and
 * README. Idempotent + fail-safe: never throws, never overwrites an existing
 * manifest.json (so user edits are preserved).
 */
export function ensureBrandPackScaffold(): void {
  try {
    const dir = getBrandPackDir();
    const assetsDir = join(dir, 'assets');
    if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });

    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      writeFileSync(manifestPath, `${JSON.stringify(SEED_MANIFEST, null, 2)}\n`, 'utf-8');
    }

    // These two are reference docs — always keep them current.
    writeFileSync(
      join(dir, 'manifest.example.json'),
      `${JSON.stringify(EXAMPLE_MANIFEST, null, 2)}\n`,
      'utf-8',
    );
    writeFileSync(join(dir, 'README.md'), README, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Promo] Brand pack scaffold failed (non-fatal): ${msg}`);
  }
}

/**
 * Load the active Brand Pack from disk, merged with built-in templates.
 * Never throws — any error falls back to the default (template-only) pack.
 */
export function loadBrandPack(): BrandPack {
  ensureBrandPackScaffold();

  const dir = getBrandPackDir();
  const manifestPath = join(dir, 'manifest.json');
  const assetsDir = join(dir, 'assets');

  if (!existsSync(manifestPath)) {
    return buildDefaultBrandPack();
  }

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as BrandPackManifest;
    return mergeBrandPack(manifest, assetsDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Promo] Failed to load brand pack manifest, using defaults: ${msg}`);
    return buildDefaultBrandPack();
  }
}
