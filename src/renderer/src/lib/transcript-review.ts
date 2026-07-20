import type { SegmentTimestamp, WordTimestamp } from '@shared/types';

export interface TranscriptSearchResult {
  id: string;
  start: number;
  end: number;
  before: string;
  match: string;
  after: string;
}

export interface TranscriptPassage {
  id: string;
  start: number;
  end: number;
  text: string;
}

function normalizedWord(text: string): string {
  return text.toLocaleLowerCase().replace(/[\s.,!?;:"()[\]{}…/\\_–—-]+/g, '');
}

function phraseTokens(query: string): string[] {
  return query.trim().split(/\s+/).map(normalizedWord).filter(Boolean);
}

function joinWords(words: readonly WordTimestamp[]): string {
  return words
    .map((word) => word.text.trim())
    .filter(Boolean)
    .join(' ');
}

/** Exact contiguous phrase matching with a small amount of readable source context. */
export function searchTranscriptWords(
  words: readonly WordTimestamp[],
  query: string,
  contextWords = 6,
): TranscriptSearchResult[] {
  const queryTokens = phraseTokens(query);
  if (queryTokens.length === 0 || words.length === 0) return [];

  const normalizedWords = words.map((word) => normalizedWord(word.text));
  const results: TranscriptSearchResult[] = [];
  for (let index = 0; index <= words.length - queryTokens.length; index += 1) {
    const matches = queryTokens.every((token, offset) => {
      const sourceToken = normalizedWords[index + offset] ?? '';
      return queryTokens.length === 1 ? sourceToken.includes(token) : sourceToken === token;
    });
    if (!matches) continue;

    const first = words[index];
    const last = words[index + queryTokens.length - 1];
    if (!first || !last) continue;
    const beforeStart = Math.max(0, index - contextWords);
    const afterEnd = Math.min(words.length, index + queryTokens.length + contextWords);
    results.push({
      id: `word-${index}-${first.start}`,
      start: first.start,
      end: last.end,
      before: joinWords(words.slice(beforeStart, index)),
      match: joinWords(words.slice(index, index + queryTokens.length)),
      after: joinWords(words.slice(index + queryTokens.length, afterEnd)),
    });
  }
  return results;
}

export function transcriptPassages(
  segments: readonly SegmentTimestamp[],
  words: readonly WordTimestamp[],
): TranscriptPassage[] {
  if (segments.length > 0) {
    return segments
      .filter((segment) => segment.text.trim() && segment.end > segment.start)
      .map((segment, index) => ({
        id: `segment-${index}-${segment.start}`,
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
      }));
  }

  const passages: TranscriptPassage[] = [];
  for (let index = 0; index < words.length; index += 24) {
    const group = words.slice(index, index + 24);
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) continue;
    passages.push({
      id: `passage-${index}-${first.start}`,
      start: first.start,
      end: last.end,
      text: joinWords(group),
    });
  }
  return passages;
}

export function transcriptTextForRange(
  words: readonly WordTimestamp[],
  start: number,
  end: number,
): string {
  return joinWords(words.filter((word) => word.end >= start && word.start <= end));
}

export function formatSourceTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const wholeSeconds = Math.floor(safe);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  const fractional = Math.floor((safe - wholeSeconds) * 10);
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder
        .toString()
        .padStart(2, '0')}.${fractional}`
    : `${minutes}:${remainder.toString().padStart(2, '0')}.${fractional}`;
}
