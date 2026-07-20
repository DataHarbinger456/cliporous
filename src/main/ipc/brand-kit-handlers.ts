import { access } from 'node:fs/promises';
import { Ch } from '@shared/ipc-channels';
import { ipcMain } from 'electron';
import { type CreatorAssetKind, selectAndCopyCreatorAsset } from '../brand-kit';
import { wrapHandler } from '../ipc-error-handler';

const CREATOR_ASSET_KINDS = new Set<CreatorAssetKind>(['logo', 'evidence', 'cta', 'reference']);

export function registerBrandKitHandlers(): void {
  ipcMain.handle(
    Ch.Invoke.BRAND_KIT_SELECT_ASSET,
    wrapHandler(
      Ch.Invoke.BRAND_KIT_SELECT_ASSET,
      async (_event, kind: CreatorAssetKind): Promise<string | null> => {
        if (!CREATOR_ASSET_KINDS.has(kind)) throw new Error('Unknown Creator Profile asset type');
        return selectAndCopyCreatorAsset(kind);
      },
    ),
  );

  ipcMain.handle(
    Ch.Invoke.BRAND_KIT_CHECK_ASSETS,
    wrapHandler(
      Ch.Invoke.BRAND_KIT_CHECK_ASSETS,
      async (_event, paths: string[]): Promise<Array<{ path: string; exists: boolean }>> => {
        if (!Array.isArray(paths) || paths.length > 100)
          throw new Error('Invalid asset health request');
        return Promise.all(
          paths.map(async (path) => {
            if (typeof path !== 'string' || !path) return { path: String(path), exists: false };
            try {
              await access(path);
              return { path, exists: true };
            } catch {
              return { path, exists: false };
            }
          }),
        );
      },
    ),
  );
}
