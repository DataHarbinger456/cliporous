import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { app, dialog } from 'electron';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_BUMPER_SIZE = 200 * 1024 * 1024; // 200 MB

const LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const BUMPER_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const CREATOR_ASSET_EXTENSIONS = new Set([
  ...Array.from(LOGO_EXTENSIONS),
  ...Array.from(BUMPER_EXTENSIONS),
  '.pdf',
]);

export type CreatorAssetKind = 'logo' | 'evidence' | 'cta' | 'reference';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBrandAssetsDir(): string {
  const dir = join(app.getPath('userData'), 'brand-assets');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Validate a file's extension and size, then copy it into the stable
 * brand-assets directory under userData. Returns the stable destination path.
 */
async function copyAsset(
  filePath: string,
  allowedExts: Set<string>,
  maxSize: number,
): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  if (!allowedExts.has(ext)) {
    throw new Error(`Invalid file type: ${ext}. Allowed: ${Array.from(allowedExts).join(', ')}`);
  }

  const fileStats = await stat(filePath);
  if (fileStats.size > maxSize) {
    const mb = Math.round(maxSize / 1024 / 1024);
    throw new Error(`File too large (max ${mb} MB)`);
  }

  const dir = getBrandAssetsDir();
  // Prefix with timestamp so repeated uploads of the same filename coexist.
  const filename = `${Date.now()}-${basename(filePath)}`;
  const destPath = join(dir, filename);
  await copyFile(filePath, destPath);
  return destPath;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Copy a logo image from the given path into the stable brand-assets directory.
 * Validates extension (.png/.jpg/.jpeg/.webp) and size (max 5 MB).
 * Throws on invalid file; returns the stable destination path.
 */
export async function copyLogoFromPath(filePath: string): Promise<string> {
  return copyAsset(filePath, LOGO_EXTENSIONS, MAX_LOGO_SIZE);
}

/**
 * Copy a bumper video from the given path into the stable brand-assets directory.
 * Validates extension (.mp4/.mov/.webm/.m4v) and size (max 200 MB).
 * Throws on invalid file; returns the stable destination path.
 */
export async function copyBumperFromPath(filePath: string): Promise<string> {
  return copyAsset(filePath, BUMPER_EXTENSIONS, MAX_BUMPER_SIZE);
}

/**
 * Open a native file-picker for a logo image (PNG / JPG / WEBP).
 * Copies the selected file to userData/brand-assets and returns the stable path.
 * Returns null if the user cancelled.
 */
export async function selectAndCopyLogo(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Logo Image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  const [selectedPath] = result.filePaths;
  if (result.canceled || !selectedPath) return null;
  return copyAsset(selectedPath, LOGO_EXTENSIONS, MAX_LOGO_SIZE);
}

/**
 * Open a native file-picker for an intro or outro bumper video.
 * Copies the selected file to userData/brand-assets and returns the stable path.
 * Returns null if the user cancelled.
 */
export async function selectAndCopyBumper(type: 'intro' | 'outro'): Promise<string | null> {
  const title = type === 'intro' ? 'Select Intro Bumper Video' : 'Select Outro Bumper Video';
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'm4v'] }],
  });
  const [selectedPath] = result.filePaths;
  if (result.canceled || !selectedPath) return null;
  return copyAsset(selectedPath, BUMPER_EXTENSIONS, MAX_BUMPER_SIZE);
}

/** Select and stabilize one Creator Profile asset inside the app data directory. */
export async function selectAndCopyCreatorAsset(kind: CreatorAssetKind): Promise<string | null> {
  const logoOnly = kind === 'logo';
  const title = {
    logo: 'Select Creator Logo',
    evidence: 'Add Evidence or Capture Asset',
    cta: 'Add CTA Asset',
    reference: 'Add Creative Reference',
  }[kind];
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openFile'],
    filters: logoOnly
      ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      : [
          {
            name: 'Creator Assets',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'webm', 'm4v', 'pdf'],
          },
        ],
  });
  const [selectedPath] = result.filePaths;
  if (result.canceled || !selectedPath) return null;
  return copyAsset(
    selectedPath,
    logoOnly ? LOGO_EXTENSIONS : CREATOR_ASSET_EXTENSIONS,
    logoOnly ? MAX_LOGO_SIZE : MAX_BUMPER_SIZE,
  );
}
