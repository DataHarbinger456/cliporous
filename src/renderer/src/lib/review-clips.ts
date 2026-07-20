import type { ClipCandidate, ClipFilter, ClipSort, StitchedClipCandidate } from '@/store/types';

export type ReviewClipItem =
  | { kind: 'normal'; clip: ClipCandidate; score: number }
  | { kind: 'stitched'; clip: StitchedClipCandidate; score: number };

const STATUS_ORDER: Record<ClipCandidate['status'], number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

export function reviewItemSourceTime(item: ReviewClipItem): number {
  if (item.kind === 'normal') return item.clip.startTime;
  const starts = item.clip.sourceRanges.map((range) => range.startTime);
  return starts.length > 0 ? Math.min(...starts) : Number.POSITIVE_INFINITY;
}

export function buildReviewItems(
  clips: readonly ClipCandidate[],
  stitchedClips: readonly StitchedClipCandidate[],
  filter: ClipFilter,
  sort: ClipSort,
): ReviewClipItem[] {
  const items: ReviewClipItem[] = [
    ...clips.map((clip): ReviewClipItem => ({ kind: 'normal', clip, score: clip.score })),
    ...stitchedClips.map((clip): ReviewClipItem => ({ kind: 'stitched', clip, score: clip.score })),
  ].filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'stitched') return item.kind === 'stitched';
    if (filter === 'unreviewed') return item.clip.status === 'pending';
    return item.clip.status === filter;
  });

  return items.sort((left, right) => {
    const sourceTimeDifference = reviewItemSourceTime(left) - reviewItemSourceTime(right);
    if (sort === 'source-time') return sourceTimeDifference || right.score - left.score;
    if (sort === 'duration') {
      return right.clip.duration - left.clip.duration || sourceTimeDifference;
    }
    if (sort === 'status') {
      return (
        STATUS_ORDER[left.clip.status] - STATUS_ORDER[right.clip.status] ||
        right.score - left.score ||
        sourceTimeDifference
      );
    }
    return right.score - left.score || sourceTimeDifference;
  });
}

export function adjacentReviewItem(
  items: readonly ReviewClipItem[],
  selectedClipId: string | null,
  direction: -1 | 1,
): ReviewClipItem | null {
  if (items.length === 0) return null;
  const currentIndex = items.findIndex((item) => item.clip.id === selectedClipId);
  if (currentIndex < 0) return direction === 1 ? (items[0] ?? null) : (items.at(-1) ?? null);
  return items[currentIndex + direction] ?? null;
}

export function nextUnreviewedItem(
  items: readonly ReviewClipItem[],
  selectedClipId: string,
): ReviewClipItem | null {
  if (items.length === 0) return null;
  const currentIndex = items.findIndex((item) => item.clip.id === selectedClipId);
  const ordered =
    currentIndex < 0 ? items : [...items.slice(currentIndex + 1), ...items.slice(0, currentIndex)];
  return ordered.find((item) => item.clip.status === 'pending') ?? null;
}
