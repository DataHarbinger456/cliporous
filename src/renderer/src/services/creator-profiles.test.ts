import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCreatorProfile,
  deleteCreatorProfile,
  deleteRememberedPreference,
  getCreatorProfiles,
  listRememberedPreferences,
  resetCreatorProfilesUsingPalette,
  updateCreatorProfile,
} from './creator-profiles';

function clearProfiles(): void {
  getCreatorProfiles().forEach((profile) => {
    deleteCreatorProfile(profile.id);
  });
}

describe('creator profile persistence and transparent memory', () => {
  beforeEach(() => {
    clearProfiles();
  });

  it('keeps reusable profile values inspectable with source, scope, and update time', () => {
    const profile = createCreatorProfile('Founder Studio');
    updateCreatorProfile(
      profile.id,
      {
        audience: 'Independent founders',
        tone: 'Direct and evidence-led',
        callToAction: { text: 'Join the studio', url: 'https://example.com', assetPaths: [] },
      },
      ['audience', 'tone', 'cta'],
    );

    const memories = listRememberedPreferences();
    expect(memories.map((memory) => memory.label)).toEqual([
      'Target audience',
      'Tone',
      'CTA default',
    ]);
    expect(memories[0]).toMatchObject({
      source: 'Saved in Founder Studio',
      scope: 'Reusable across projects',
    });
    expect(Number.isNaN(new Date(memories[0]?.updatedAt ?? '').getTime())).toBe(false);
  });

  it('deletes the actual saved preference instead of hiding an audit row', () => {
    const profile = createCreatorProfile('Founder Studio');
    updateCreatorProfile(profile.id, { audience: 'Independent founders' }, ['audience']);

    deleteRememberedPreference(profile.id, 'audience');

    expect(getCreatorProfiles()[0]?.audience).toBe('');
    expect(listRememberedPreferences()).toHaveLength(0);
  });

  it('repairs only profiles that reference a deleted custom palette', () => {
    const affected = createCreatorProfile('Founder Studio');
    const unaffected = createCreatorProfile('Editorial Studio');
    updateCreatorProfile(affected.id, { longformPaletteId: 'custom-gold' }, ['longformPalette']);
    updateCreatorProfile(unaffected.id, { longformPaletteId: 'midnight-cyan' }, [
      'longformPalette',
    ]);

    resetCreatorProfilesUsingPalette('custom-gold');

    expect(getCreatorProfiles().find((profile) => profile.id === affected.id)).toMatchObject({
      longformPaletteId: 'brand',
    });
    expect(getCreatorProfiles().find((profile) => profile.id === unaffected.id)).toMatchObject({
      longformPaletteId: 'midnight-cyan',
    });
    expect(
      listRememberedPreferences().find(
        (preference) =>
          preference.profileId === affected.id && preference.key === 'longformPalette',
      )?.value,
    ).toBe('brand');
  });
});
