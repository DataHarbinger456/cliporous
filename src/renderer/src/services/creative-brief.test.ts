import { describe, expect, it } from 'vitest';
import type { CreativeBrief } from '@/store/types';
import {
  buildCommittedCreativeGuidance,
  creativeBriefHasUncommittedChanges,
} from './creative-brief';

const draft: CreativeBrief = {
  audience: 'Independent creators',
  goal: 'Drive qualified signups',
  callToAction: 'Join the cohort',
  tone: 'Warm and direct',
  mustInclude: 'Real workflow proof',
  prohibitedClaims: 'Guaranteed results',
  notes: 'Keep the founder story intact.',
  committed: null,
  savedAt: null,
  updatedAt: '2026-07-17T12:00:00.000Z',
};

describe('Creative Brief prompt boundary', () => {
  it('autosaves draft fields without sending them to AI before explicit save', () => {
    expect(creativeBriefHasUncommittedChanges(draft)).toBe(true);
    expect(buildCommittedCreativeGuidance(draft, 'PROFILE DEFAULT')).toBe('PROFILE DEFAULT');
  });

  it('adds only the creator-approved snapshot to reusable profile guidance', () => {
    const committed = { ...draft, committed: { ...draft } } as CreativeBrief;
    const prompt = buildCommittedCreativeGuidance(committed, 'PROFILE DEFAULT');

    expect(prompt).toContain('PROFILE DEFAULT');
    expect(prompt).toContain('TARGET AUDIENCE:\nIndependent creators');
    expect(prompt).toContain('PROHIBITED CLAIMS:\nGuaranteed results');
  });
});
