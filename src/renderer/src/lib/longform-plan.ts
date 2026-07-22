import {
  longformLayersMayOverlap,
  longformRangesOverlap,
  MAX_LONGFORM_BLOCK_SECONDS,
  removeLongformPlanRangeConflicts,
  resolveLongformPlanOverlaps,
} from '@shared/longform-plan-timing';
import type {
  BlockPlacement,
  DelosCardPlacement,
  LongformEditPlan,
  LongformPlanItemType,
  PhraseEmphasis,
  WordTimestamp,
} from '@shared/types';

export interface LongformPlanItemRef {
  type: LongformPlanItemType;
  index: number;
}

export interface LongformPlanItemView extends LongformPlanItemRef {
  key: string;
  startTime: number;
  endTime: number;
  title: string;
  detail: string;
  kind: string;
  sourceText: string;
}

export interface LongformPlanSection {
  id: string;
  index: number;
  title: string;
  startTime: number;
  endTime: number;
  items: LongformPlanItemView[];
  sourceText: string;
}

export interface LongformPlanItemUpdate {
  title: string;
  detail?: string;
  startTime: number;
  endTime: number;
}

export interface LongformPlanDiff {
  added: number;
  removed: number;
  unchanged: number;
  timingChanges: number;
}

export interface PreservedLongformItem {
  key: string;
  type: LongformPlanItemType;
  item: PhraseEmphasis | BlockPlacement | DelosCardPlacement;
}

const SECTION_TARGET_SECONDS = 90;
const SECTION_BREAK_SECONDS = 42;

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function humanizeLongformKind(value: string): string {
  return value
    .replace(/delos-/g, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function transcriptExcerpt(
  words: readonly WordTimestamp[],
  startTime: number,
  endTime: number,
  paddingSeconds = 2,
): string {
  const excerpt = words
    .filter(
      (word) => word.end >= startTime - paddingSeconds && word.start <= endTime + paddingSeconds,
    )
    .map((word) => word.text)
    .join(' ')
    .trim();
  if (excerpt.length <= 240) return excerpt;
  return `${excerpt.slice(0, 237).trimEnd()}…`;
}

export function longformItemKey(
  type: LongformPlanItemType,
  item: PhraseEmphasis | BlockPlacement | DelosCardPlacement,
): string {
  const text =
    type === 'phrase'
      ? (item as PhraseEmphasis).text
      : type === 'block'
        ? `${(item as BlockPlacement).kind}:${(item as BlockPlacement).heading ?? ''}`
        : `${(item as DelosCardPlacement).kind}:${(item as DelosCardPlacement).sourceText ?? ''}`;
  return `${type}:${item.startTime.toFixed(2)}:${item.endTime.toFixed(2)}:${text.slice(0, 80)}`;
}

export function buildLongformPlanItems(
  plan: LongformEditPlan,
  words: readonly WordTimestamp[],
): LongformPlanItemView[] {
  const phrases = plan.phrases.map<LongformPlanItemView>((item, index) => ({
    type: 'phrase',
    index,
    key: longformItemKey('phrase', item),
    startTime: item.startTime,
    endTime: item.endTime,
    title: item.text,
    detail: 'Spoken phrase emphasized over the speaker',
    kind: 'Phrase overlay',
    sourceText: transcriptExcerpt(words, item.startTime, item.endTime),
  }));
  const blocks = plan.blocks.map<LongformPlanItemView>((item, index) => ({
    type: 'block',
    index,
    key: longformItemKey('block', item),
    startTime: item.startTime,
    endTime: item.endTime,
    title: item.heading || humanizeLongformKind(item.kind),
    detail: item.kicker || 'Full-frame evidence graphic',
    kind: humanizeLongformKind(item.kind),
    sourceText: transcriptExcerpt(words, item.startTime, item.endTime),
  }));
  const cards = (plan.cards ?? []).map<LongformPlanItemView>((item, index) => ({
    type: 'card',
    index,
    key: longformItemKey('card', item),
    startTime: item.startTime,
    endTime: item.endTime,
    title: item.sourceText?.trim() || humanizeLongformKind(item.kind),
    detail: 'Evidence card over the speaker',
    kind: humanizeLongformKind(item.kind),
    sourceText: item.sourceText?.trim() || transcriptExcerpt(words, item.startTime, item.endTime),
  }));
  return [...phrases, ...blocks, ...cards].sort(
    (left, right) => left.startTime - right.startTime || left.endTime - right.endTime,
  );
}

function sectionTitle(index: number, items: readonly LongformPlanItemView[]): string {
  if (index === 0) return 'Opening';
  const anchor = items.find((item) => item.type === 'block') ?? items[0];
  if (!anchor) return `Section ${index + 1}`;
  const title = anchor.title.trim();
  return title.length > 44 ? `${title.slice(0, 41).trimEnd()}…` : title;
}

export function buildLongformSections(
  plan: LongformEditPlan,
  words: readonly WordTimestamp[],
  duration: number,
): LongformPlanSection[] {
  const items = buildLongformPlanItems(plan, words);
  if (items.length === 0) {
    return [
      {
        id: 'section-0',
        index: 0,
        title: 'Speaker cut',
        startTime: 0,
        endTime: Math.max(0, duration),
        items: [],
        sourceText: transcriptExcerpt(words, 0, duration, 0),
      },
    ];
  }

  const groups: LongformPlanItemView[][] = [];
  let current: LongformPlanItemView[] = [];
  let sectionStart = items[0]?.startTime ?? 0;
  let previousEnd = sectionStart;

  for (const item of items) {
    const exceedsTarget =
      current.length > 0 && item.startTime - sectionStart >= SECTION_TARGET_SECONDS;
    const followsLongGap =
      current.length > 0 && item.startTime - previousEnd >= SECTION_BREAK_SECONDS;
    if (exceedsTarget || followsLongGap) {
      groups.push(current);
      current = [];
      sectionStart = item.startTime;
    }
    current.push(item);
    previousEnd = Math.max(previousEnd, item.endTime);
  }
  if (current.length > 0) groups.push(current);

  return groups.map((sectionItems, index) => {
    const previous = groups[index - 1];
    const next = groups[index + 1];
    const first = sectionItems[0];
    const last = sectionItems.at(-1);
    const previousEndTime = previous?.at(-1)?.endTime ?? 0;
    const nextStartTime = next?.[0]?.startTime ?? duration;
    const startTime = index === 0 ? 0 : Math.max(previousEndTime, first?.startTime ?? 0);
    const endTime =
      index === groups.length - 1 ? duration : Math.min(nextStartTime, last?.endTime ?? duration);
    return {
      id: `section-${index}`,
      index,
      title: sectionTitle(index, sectionItems),
      startTime,
      endTime: Math.max(startTime, endTime),
      items: sectionItems,
      sourceText: transcriptExcerpt(words, startTime, Math.max(startTime, endTime), 0),
    };
  });
}

export function estimateLongformRenderSeconds(plan: LongformEditPlan, duration: number): number {
  const visualComplexity =
    plan.blocks.length * 12 + plan.phrases.length * 3 + (plan.cards?.length ?? 0) * 4;
  return Math.max(30, Math.round(duration * 1.25 + visualComplexity));
}

function clonePlan(plan: LongformEditPlan): LongformEditPlan {
  return structuredClone(plan);
}

export function updateLongformPlanItem(
  plan: LongformEditPlan,
  ref: LongformPlanItemRef,
  update: LongformPlanItemUpdate,
): LongformEditPlan {
  const next = clonePlan(plan);
  const startTime = Math.max(0, update.startTime);
  const requestedEndTime = Math.max(startTime + 0.2, update.endTime);
  const endTime =
    ref.type === 'block'
      ? Math.min(requestedEndTime, startTime + MAX_LONGFORM_BLOCK_SECONDS)
      : requestedEndTime;
  let editedItem: PhraseEmphasis | BlockPlacement | DelosCardPlacement | undefined;
  if (ref.type === 'phrase') {
    const item = next.phrases[ref.index];
    if (item) {
      Object.assign(item, { text: update.title.trim(), startTime, endTime });
      editedItem = item;
    }
  } else if (ref.type === 'block') {
    const item = next.blocks[ref.index];
    if (item) {
      Object.assign(item, {
        heading: update.title.trim(),
        kicker: update.detail?.trim() || item.kicker,
        startTime,
        endTime,
      });
      editedItem = item;
    }
  } else {
    const item = next.cards?.[ref.index];
    if (item) {
      Object.assign(item, { sourceText: update.title.trim(), startTime, endTime });
      editedItem = item;
    }
  }
  next.generatedAt = Date.now();
  return editedItem ? removeLongformPlanRangeConflicts(next, editedItem, ref) : next;
}

export function removeLongformPlanItem(
  plan: LongformEditPlan,
  ref: LongformPlanItemRef,
): LongformEditPlan {
  const next = clonePlan(plan);
  if (ref.type === 'phrase') next.phrases.splice(ref.index, 1);
  else if (ref.type === 'block') next.blocks.splice(ref.index, 1);
  else next.cards?.splice(ref.index, 1);
  next.generatedAt = Date.now();
  return next;
}

function nearSameSlot(
  candidate: PhraseEmphasis | BlockPlacement | DelosCardPlacement,
  preserved: PhraseEmphasis | BlockPlacement | DelosCardPlacement,
): boolean {
  return Math.abs(candidate.startTime - preserved.startTime) <= 8;
}

export function mergePreservedLongformItems(
  generated: LongformEditPlan,
  preservedItems: readonly PreservedLongformItem[],
): LongformEditPlan {
  let next = resolveLongformPlanOverlaps(clonePlan(generated));
  const acceptedPreserved: Array<Pick<PreservedLongformItem, 'type' | 'item'>> = [];
  const chronological = [...preservedItems].sort(
    (left, right) => left.item.startTime - right.item.startTime,
  );

  for (const preserved of chronological) {
    const item = structuredClone(preserved.item);
    if (
      acceptedPreserved.some(
        (candidate) =>
          !longformLayersMayOverlap(candidate.type, preserved.type) &&
          longformRangesOverlap(candidate.item, item),
      )
    ) {
      continue;
    }

    if (preserved.type === 'phrase') {
      next.phrases = next.phrases.filter((candidate) => !nearSameSlot(candidate, item));
    } else if (preserved.type === 'block') {
      next.blocks = next.blocks.filter((candidate) => !nearSameSlot(candidate, item));
    } else {
      next.cards = (next.cards ?? []).filter((candidate) => !nearSameSlot(candidate, item));
    }
    next = removeLongformPlanRangeConflicts(next, item, undefined, preserved.type);

    if (preserved.type === 'phrase') next.phrases.push(item as PhraseEmphasis);
    else if (preserved.type === 'block') next.blocks.push(item as BlockPlacement);
    else {
      next.cards ??= [];
      next.cards.push(item as DelosCardPlacement);
    }
    acceptedPreserved.push({ type: preserved.type, item });
  }

  return resolveLongformPlanOverlaps(next);
}

function comparableKey(item: LongformPlanItemView): string {
  return `${item.type}:${item.kind}:${item.title.toLocaleLowerCase()}`;
}

export function compareLongformPlans(
  left: LongformEditPlan,
  right: LongformEditPlan,
): LongformPlanDiff {
  const leftItems = buildLongformPlanItems(left, []);
  const rightItems = buildLongformPlanItems(right, []);
  const leftMap = new Map(leftItems.map((item) => [comparableKey(item), item]));
  const rightMap = new Map(rightItems.map((item) => [comparableKey(item), item]));
  let unchanged = 0;
  let timingChanges = 0;
  for (const [key, leftItem] of Array.from(leftMap.entries())) {
    const rightItem = rightMap.get(key);
    if (!rightItem) continue;
    unchanged += 1;
    if (
      Math.abs(leftItem.startTime - rightItem.startTime) > 0.05 ||
      Math.abs(leftItem.endTime - rightItem.endTime) > 0.05
    ) {
      timingChanges += 1;
    }
  }
  return {
    added: Array.from(rightMap.keys()).filter((key) => !leftMap.has(key)).length,
    removed: Array.from(leftMap.keys()).filter((key) => !rightMap.has(key)).length,
    unchanged,
    timingChanges,
  };
}

export function planItemFromRef(
  plan: LongformEditPlan,
  ref: LongformPlanItemRef,
): PhraseEmphasis | BlockPlacement | DelosCardPlacement | null {
  if (ref.type === 'phrase') return plan.phrases[ref.index] ?? null;
  if (ref.type === 'block') return plan.blocks[ref.index] ?? null;
  return plan.cards?.[ref.index] ?? null;
}
