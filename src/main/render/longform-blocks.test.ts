// ---------------------------------------------------------------------------
// Long-form block wiring tests.
//
//   1. `buildTimeline` turns `plan.blocks` into chronological `kind: 'block'`
//      inserts, dropping overlaps (first-by-start wins) alongside cards/headers.
//   2. `resolveLongformBlockCompositionId` reproduces the exact composition ids
//      registered in Root.tsx (`${Base}-${skinId}`) — guards the base map vs
//      typos that would make a block fail to `selectComposition` at render.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from 'vitest';

// longform-pipeline pulls in electron/ffmpeg at module load; stub electron so
// the import resolves cleanly in the node test environment.
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp'), getAppPath: vi.fn(() => '/tmp') },
  BrowserWindow: class {},
}));

import { getPaletteById } from '@shared/palettes';
import type { BlockPlacement, LongformBlockKind, LongformEditPlan } from '@shared/types';
import {
  DEFAULT_LONGFORM_BLOCK_SKIN,
  resolveLongformBlockCompositionId,
} from '../remotion/registry';
import { buildBlockInputProps } from './features/blocks.feature';
import {
  buildLongformRenderReconciliation,
  buildLongformRenderSummary,
  buildTimeline,
  MIN_GAP_BETWEEN_BLOCKS,
} from './longform-pipeline';

function emptyPlan(over: Partial<LongformEditPlan> = {}): LongformEditPlan {
  return {
    phrases: [],
    blocks: [],
    reasoning: '',
    generatedAt: 0,
    ...over,
  };
}

/** A minimal valid numbered-list placement for timeline insertion tests. */
function block(startTime: number, endTime: number): BlockPlacement {
  return {
    kind: 'numbered-list',
    startTime,
    endTime,
    kicker: 'K',
    heading: 'H',
    items: [{ text: 'a' }, { text: 'b' }],
  };
}

describe('buildTimeline — blocks', () => {
  it('inserts blocks as kind:block segments with speaker fill around them', () => {
    const plan = emptyPlan({ blocks: [block(10, 14)] });
    const timeline = buildTimeline(plan, 30);

    const kinds = timeline.map((b) => b.kind);
    expect(kinds).toEqual(['speaker', 'block', 'speaker']);

    const blk = timeline.find((b) => b.kind === 'block');
    expect(blk).toBeDefined();
    if (blk && blk.kind === 'block') {
      expect(blk.startTime).toBe(10);
      expect(blk.endTime).toBe(14);
      expect(blk.placement.kind).toBe('numbered-list');
    }
  });

  it('orders blocks chronologically and drops overlapping inserts', () => {
    const plan = emptyPlan({
      blocks: [
        block(20, 24),
        block(5, 9),
        block(7, 11), // overlaps the 5–9 block → dropped
      ],
    });
    const timeline = buildTimeline(plan, 40);
    const blocks = timeline.filter((b) => b.kind === 'block');
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.startTime)).toEqual([5, 20]);
  });

  it('drops a block that overlaps an earlier block', () => {
    const plan = emptyPlan({
      blocks: [block(5, 12), block(8, 12)], // second starts inside the first → dropped
    });
    const timeline = buildTimeline(plan, 30);
    expect(timeline.filter((b) => b.kind === 'block')).toHaveLength(1);
  });
});

describe('buildTimeline — minimum gap between blocks', () => {
  // In the BODY (after the 60s intro) MIN_GAP_BETWEEN_BLOCKS is 6s of speaker
  // time between block end→start; the intro window runs a tighter 3s gap.
  it('drops a body insert that starts too soon after the previous block ends', () => {
    // Both blocks sit past the intro window. gap = 75 - 72 = 3s < 6s → the
    // second block is dropped, earlier one wins.
    const plan = emptyPlan({ blocks: [block(68, 72), block(75, 79)] });
    const timeline = buildTimeline(plan, 120);
    const blocks = timeline.filter((b) => b.kind === 'block');
    expect(blocks).toHaveLength(1);
    expect(blocks.map((b) => b.startTime)).toEqual([68]);
  });

  it('keeps two body blocks separated by at least the minimum gap', () => {
    // gap = 80 - 72 = 8s >= 6s → both survive with a speaker block between them.
    const plan = emptyPlan({ blocks: [block(68, 72), block(80, 84)] });
    const timeline = buildTimeline(plan, 120);
    const blocks = timeline.filter((b) => b.kind === 'block');
    expect(blocks.map((b) => b.startTime)).toEqual([68, 80]);
    expect(timeline.map((b) => b.kind)).toEqual([
      'speaker',
      'block',
      'speaker',
      'block',
      'speaker',
    ]);
  });

  it('keeps the earlier block and re-anchors the gap to the LAST accepted block', () => {
    // block(75,79) is dropped (3s after block(68,72)). block(90,94) is measured
    // against the last ACCEPTED end (72), not the dropped one: 90 - 72 = 18 >= 6.
    const plan = emptyPlan({ blocks: [block(68, 72), block(75, 79), block(90, 94)] });
    const timeline = buildTimeline(plan, 120);
    const blocks = timeline.filter((b) => b.kind === 'block');
    expect(blocks.map((b) => b.startTime)).toEqual([68, 90]);
  });

  it('runs a tighter cadence inside the intro window', () => {
    // gap = 9 - 5 = 4s. In the body (>6s) this would be dropped, but both blocks
    // start inside the 60s intro where the required gap is only 3s → both kept.
    const plan = emptyPlan({ blocks: [block(1, 5), block(9, 13)] });
    const timeline = buildTimeline(plan, 120);
    const blocks = timeline.filter((b) => b.kind === 'block');
    expect(blocks.map((b) => b.startTime)).toEqual([1, 9]);
  });

  it('honors a configurable smaller gap so close body blocks survive', () => {
    // Two body blocks with a 3s gap. Default body gap (6s) would drop the
    // second, but the caller permits a 2s minimum → both kept.
    const plan = emptyPlan({ blocks: [block(68, 72), block(75, 79)] });
    const timeline = buildTimeline(plan, 120, 2, 2);
    const blocks = timeline.filter((b) => b.kind === 'block');
    expect(blocks.map((b) => b.startTime)).toEqual([68, 75]);
  });

  it('exports a positive default gap', () => {
    expect(MIN_GAP_BETWEEN_BLOCKS).toBeGreaterThan(0);
  });
});

describe('resolveLongformBlockCompositionId', () => {
  const cases: Array<[LongformBlockKind, string]> = [
    ['bar-chart', 'BarChart'],
    ['comparison', 'Comparison'],
    ['comparison-table', 'ComparisonTable'],
    ['stat-grid', 'StatGrid'],
    ['icon-stat-grid', 'IconStatGrid'],
    ['icon-row', 'IconRow'],
    ['numbered-list', 'NumberedList'],
    ['checklist', 'Checklist'],
    ['stat-hero', 'StatHero'],
    ['progress-bars', 'ProgressBars'],
    ['kpi-ticker', 'KpiTicker'],
    ['quote-card', 'QuoteCard'],
    ['tweet-card', 'TweetCard'],
    ['definition-card', 'DefinitionCard'],
    ['timeline', 'Timeline'],
    ['timeline-cards', 'TimelineCards'],
    ['feature-grid', 'FeatureGrid'],
  ];

  it('reconstructs the registered ${Base}-${skinId} composition id', () => {
    for (const [kind, base] of cases) {
      expect(resolveLongformBlockCompositionId(kind, 'editorial')).toBe(`${base}-editorial`);
      expect(resolveLongformBlockCompositionId(kind, 'terminal')).toBe(`${base}-terminal`);
    }
  });

  it('uses a real skin id as the default', () => {
    expect(['aurora-glass', 'editorial', 'bento', 'terminal']).toContain(
      DEFAULT_LONGFORM_BLOCK_SKIN,
    );
  });
});

describe('buildBlockInputProps — palette wiring', () => {
  const numberedList: BlockPlacement = {
    kind: 'numbered-list',
    startTime: 0,
    endTime: 4,
    kicker: 'K',
    heading: 'H',
    items: [{ text: 'a' }, { text: 'b' }],
  };
  const statHero: BlockPlacement = {
    kind: 'stat-hero',
    startTime: 0,
    endTime: 4,
    kicker: 'K',
    heading: 'H',
    value: 42,
    label: 'units',
  };

  it('merges the resolved palette into inputProps for multiple block kinds', () => {
    const palette = getPaletteById('midnight-cyan');
    for (const placement of [numberedList, statHero]) {
      const props = buildBlockInputProps(placement, 'editorial', palette);
      expect(props.skinId).toBe('editorial');
      expect(props.palette).toBe(palette);
    }
  });

  it('omits the palette key entirely when none is supplied', () => {
    const props = buildBlockInputProps(numberedList, 'terminal');
    expect('palette' in props).toBe(false);
  });

  it('resolves a longformPaletteId to the expected color triple', () => {
    const palette = getPaletteById('brand');
    const props = buildBlockInputProps(numberedList, 'editorial', palette);
    expect(props.palette).toMatchObject({
      background: '#23100c',
      foreground: '#f6ecd9',
      accent: '#9f75ff',
    });
  });
});

describe('buildLongformRenderSummary (RF-008)', () => {
  it('returns undefined on a fully clean render (no cards, no dropped blocks)', () => {
    expect(buildLongformRenderSummary(0, null)).toBeUndefined();
    expect(
      buildLongformRenderSummary(0, { rendered: 0, dropped: 0, aiText: 0, fallbackText: 0 }),
    ).toBeUndefined();
  });

  it('reports the card count when all cards rendered', () => {
    expect(
      buildLongformRenderSummary(0, { rendered: 9, dropped: 0, aiText: 9, fallbackText: 0 }),
    ).toBe('9 cards');
  });

  it('reports unavailable cards alongside the rendered count', () => {
    expect(
      buildLongformRenderSummary(0, { rendered: 7, dropped: 2, aiText: 7, fallbackText: 0 }),
    ).toBe('7 cards · 2 unavailable');
  });

  it('reports cards that fell back to offline text', () => {
    expect(
      buildLongformRenderSummary(0, { rendered: 9, dropped: 0, aiText: 7, fallbackText: 2 }),
    ).toBe('9 cards · 2 offline text');
  });

  it('singularises a single dropped block', () => {
    expect(buildLongformRenderSummary(1, null)).toBe('1 block dropped');
  });

  it('pluralises multiple dropped blocks', () => {
    expect(buildLongformRenderSummary(3, null)).toBe('3 blocks dropped');
  });

  it('combines card and block notes', () => {
    expect(
      buildLongformRenderSummary(1, { rendered: 9, dropped: 2, aiText: 7, fallbackText: 2 }),
    ).toBe('9 cards · 2 unavailable · 2 offline text · 1 block dropped');
  });
});

describe('buildLongformRenderReconciliation', () => {
  it('reports planned, eligible, rendered, and every fallback reason', () => {
    const result = buildLongformRenderReconciliation({
      outputPath: '/exports/story_longform.mp4',
      plannedPhrases: 8,
      eligiblePhrases: 6,
      phraseStats: { rendered: 5, dropped: 1 },
      plannedBlocks: 7,
      placedBlocks: 5,
      droppedBlocks: 1,
      plannedCards: 4,
      eligibleCards: 3,
      cardStats: { rendered: 2, dropped: 1, aiText: 1, fallbackText: 1 },
    });

    expect(result.phrases).toMatchObject({ planned: 8, eligible: 6, rendered: 5, dropped: 3 });
    expect(result.blocks).toMatchObject({ planned: 7, eligible: 5, rendered: 4, dropped: 3 });
    expect(result.cards).toMatchObject({ planned: 4, eligible: 3, rendered: 2, dropped: 2 });
    expect(result.fallbacks.map((fallback) => fallback.reason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('timeline spacing'),
        expect.stringContaining('speaker shot'),
        expect.stringContaining('full-frame visual'),
        expect.stringContaining('phrase overlay'),
        expect.stringContaining('card asset'),
        expect.stringContaining('transcript-derived text'),
      ]),
    );
  });
});
