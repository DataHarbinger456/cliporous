import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PromoModeWorkflow } from '@/components/PromoModeWorkflow';
import {
  createCreatorProfile,
  deleteCreatorProfile,
  getCreatorProfiles,
  updateCreatorProfile,
} from '@/services/creator-profiles';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './__tests__/test-utils';

function clearProfiles(): void {
  for (const profile of getCreatorProfiles()) deleteCreatorProfile(profile.id);
}

describe('PromoModeWorkflow', () => {
  beforeEach(() => {
    installApiStub();
    resetStore();
    clearProfiles();
  });

  afterEach(clearProfiles);

  it('reuses a Creator Profile as the Brand Pack and explains B-roll precedence', async () => {
    const profile = createCreatorProfile('Launch Brand Pack');
    updateCreatorProfile(
      profile.id,
      {
        evidenceAssetPaths: ['/virtual/product.png'],
        callToAction: {
          text: 'Join the studio',
          url: 'https://example.test',
          assetPaths: ['/virtual/join.png'],
        },
      },
      ['evidenceAssets', 'cta'],
    );
    act(() => {
      useStore.getState().setCreatorProfile(profile.id);
      useStore.getState().setPromoPlan({
        beats: [
          {
            id: 'beat-1',
            script: 'Watch the product turn one recording into a full campaign.',
            evidenceCategory: 'app-ui',
            evidenceAssetPath: '/virtual/product.png',
          },
        ],
        ctaSource: 'profile',
        ctaAssetPath: '/virtual/join.png',
      });
    });

    render(<PromoModeWorkflow />);

    expect(screen.getByText('Launch Brand Pack: 1 evidence, 1 CTA assets')).toBeInTheDocument();
    expect(screen.getByText(/Promo evidence replaces stock B-roll/)).toBeInTheDocument();
    expect(screen.getAllByText('Clip one')).toHaveLength(2);
    await waitFor(() =>
      expect(screen.getByText('Every saved asset is available')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Mark ready to record' })).toBeEnabled();
  });

  it('surfaces selected missing assets without losing the script plan', async () => {
    installApiStub({
      checkCreatorAssets: async (paths: string[]) =>
        paths.map((path) => ({ path, exists: path !== '/virtual/missing.png' })),
    });
    const profile = createCreatorProfile('Proof Pack');
    updateCreatorProfile(profile.id, { evidenceAssetPaths: ['/virtual/missing.png'] }, [
      'evidenceAssets',
    ]);
    act(() => {
      useStore.getState().setCreatorProfile(profile.id);
      useStore.getState().setPromoPlan({
        beats: [
          {
            id: 'beat-missing',
            script: 'Here is the evidence behind the claim.',
            evidenceCategory: 'community-proof',
            evidenceAssetPath: '/virtual/missing.png',
          },
        ],
        ctaSource: 'none',
      });
    });

    render(<PromoModeWorkflow />);

    await waitFor(() => expect(screen.getByText('1 saved file is missing')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Here is the evidence behind the claim.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark ready to record' })).toBeDisabled();
  });
});
