import { describe, expect, it } from 'vitest';
import type { ClipCandidate, StitchedClipCandidate } from '@/store/types';
import { adjacentReviewItem, buildReviewItems, nextUnreviewedItem } from './review-clips';

function clip(
  id: string,
  status: ClipCandidate['status'],
  score: number,
  startTime: number,
  duration: number,
): ClipCandidate {
  return {
    id,
    sourceId: 'source-1',
    startTime,
    endTime: startTime + duration,
    duration,
    text: id,
    score,
    hookText: id,
    reasoning: id,
    status,
  };
}

const STITCHED: StitchedClipCandidate = {
  id: 'stitched-1',
  sourceId: 'source-1',
  sourceRanges: [
    { startTime: 45, endTime: 50, role: 'hook' },
    { startTime: 90, endTime: 100, role: 'main-payoff' },
  ],
  duration: 15,
  text: 'stitched',
  score: 88,
  hookText: 'stitched',
  reasoning: 'stitched',
  status: 'pending',
};

const CLIPS = [
  clip('approved', 'approved', 92, 100, 12),
  clip('pending', 'pending', 80, 10, 40),
  clip('rejected', 'rejected', 70, 60, 20),
];

describe('review clip filtering and sorting', () => {
  it('supports every filter including stitched clips', () => {
    expect(buildReviewItems(CLIPS, [STITCHED], 'all', 'score')).toHaveLength(4);
    expect(
      buildReviewItems(CLIPS, [STITCHED], 'unreviewed', 'score').map((item) => item.clip.id),
    ).toEqual(['stitched-1', 'pending']);
    expect(
      buildReviewItems(CLIPS, [STITCHED], 'approved', 'score').map((item) => item.clip.id),
    ).toEqual(['approved']);
    expect(
      buildReviewItems(CLIPS, [STITCHED], 'rejected', 'score').map((item) => item.clip.id),
    ).toEqual(['rejected']);
    expect(
      buildReviewItems(CLIPS, [STITCHED], 'stitched', 'score').map((item) => item.clip.id),
    ).toEqual(['stitched-1']);
  });

  it('sorts by score, source time, duration, and review status', () => {
    expect(buildReviewItems(CLIPS, [STITCHED], 'all', 'score').map((item) => item.clip.id)).toEqual(
      ['approved', 'stitched-1', 'pending', 'rejected'],
    );
    expect(
      buildReviewItems(CLIPS, [STITCHED], 'all', 'source-time').map((item) => item.clip.id),
    ).toEqual(['pending', 'stitched-1', 'rejected', 'approved']);
    expect(
      buildReviewItems(CLIPS, [STITCHED], 'all', 'duration').map((item) => item.clip.id),
    ).toEqual(['pending', 'rejected', 'stitched-1', 'approved']);
    expect(
      buildReviewItems(CLIPS, [STITCHED], 'all', 'status').map((item) => item.clip.id),
    ).toEqual(['stitched-1', 'pending', 'approved', 'rejected']);
  });

  it('keeps navigation in visible order and finds the next unreviewed item', () => {
    const items = buildReviewItems(CLIPS, [STITCHED], 'all', 'source-time');
    expect(adjacentReviewItem(items, null, 1)?.clip.id).toBe('pending');
    expect(adjacentReviewItem(items, 'stitched-1', 1)?.clip.id).toBe('rejected');
    expect(adjacentReviewItem(items, 'pending', -1)).toBeNull();
    expect(nextUnreviewedItem(items, 'pending')?.clip.id).toBe('stitched-1');
  });
});
