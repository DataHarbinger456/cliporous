import { DEFAULT_PALETTE_ID } from '@shared/palettes';
import { resetCreatorProfilesUsingPalette } from '@/services/creator-profiles';
import { useStore } from '@/store';

/** Remove one shared custom palette and repair project/profile references. */
export function deleteCustomPaletteEverywhere(paletteId: string): void {
  const state = useStore.getState();
  if (!state.settings.customPalettes.some((palette) => palette.id === paletteId)) return;

  state.removeCustomPalette(paletteId);
  resetCreatorProfilesUsingPalette(paletteId, DEFAULT_PALETTE_ID);
  if (state.creatorProfile.overrides.longformPaletteId === paletteId) {
    state.clearCreatorProfileOverride('longformPaletteId');
  }
}
