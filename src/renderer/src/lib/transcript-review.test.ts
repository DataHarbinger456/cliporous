import type { WordTimestamp } from '@shared/types';
import { describe, expect, it } from 'vitest';

import {
  formatSourceTime,
  searchTranscriptWords,
  transcriptPassages,
  transcriptTextForRange,
} from './transcript-review';

const WORDS: WordTimestamp[] = [
  { text: 'Great', start: 10, end: 10.4 },
  { text: 'stories', start: 10.5, end: 11 },
  { text: 'start', start: 11.1, end: 11.5 },
  { text: 'with', start: 11.6, end: 11.9 },
  { text: 'tension.', start: 12, end: 12.6 },
  { text: 'Great', start: 40, end: 40.4 },
  { text: 'results', start: 40.5, end: 41 },
];

describe('transcript review helpers', () => {
  it('finds words and exact contiguous phrases with source timestamps', () => {
    expect(searchTranscriptWords(WORDS, 'great')).toHaveLength(2);
    expect(searchTranscriptWords(WORDS, 'stories start')).toMatchObject([
      { start: 10.5, end: 11.5, match: 'stories start' },
    ]);
    expect(searchTranscriptWords(WORDS, 'stories tension')).toEqual([]);
  });

  it('derives readable passages and selected text when ASR segments are unavailable', () => {
    const passages = transcriptPassages([], WORDS);
    expect(passages).toHaveLength(1);
    expect(passages[0]?.text).toContain('Great stories start');
    expect(transcriptTextForRange(WORDS, 10.4, 12)).toBe('Great stories start with tension.');
  });

  it('formats source time with hours and tenths', () => {
    expect(formatSourceTime(65.28)).toBe('1:05.2');
    expect(formatSourceTime(3665.28)).toBe('1:01:05.2');
  });
});
