/**
 * Types for the edit-styles / templates system.
 *
 * EditStyleTemplate is authored per edit-style and archetype. Ordinary
 * subtitle geometry is global; templates retain only picker metadata and the
 * intentional fullscreen-quote grouping exception.
 *
 * ResolvedTemplate is what the render pipeline consumes after merging a
 * template with its edit-style defaults.
 */

import type { Archetype } from './archetypes';

// Types referenced here (EditStyle, TransitionType, SegmentStyleCategory,
// CaptionStyleInput, ColorGradeParams, VFXOverlay, TextAnimationStyle,
// HeadlineStyleConfig) are declared globally in src/main/global.d.ts — we
// consume the ambient declarations.

export type Energy = 'low' | 'medium' | 'high';

export type TMap = Record<string, TransitionType>;

export type CaptionPosition = 'lower-third' | 'center' | 'top';

/**
 * Per-template caption grouping override.
 *
 * `word-by-word` is reserved for fullscreen-quote, where the transcript is
 * full-frame hero typography rather than the ordinary subtitle track.
 */
export type TemplateCaptionMode = 'word-by-word';

export interface EditStyleTemplate {
  archetype: Archetype;
  /** Overrides the editStyle default zoom when set. */
  zoomStyle?: EditStyle['defaultZoomStyle'];
  zoomIntensity?: number;
  captionPosition?: CaptionPosition;
  /**
   * Optional per-archetype caption rendering mode. Currently only
   * 'word-by-word' is supported; omit for the default multi-word grouping.
   */
  captionMode?: TemplateCaptionMode;
  /**
   * Per-archetype Y position in pixels from the top of the locked 1920px
   * canvas for the hook title pill. The creator's global layout still wins
   * for speaker archetypes.
   */
  hookTitleY?: number;
  /**
   * Per-archetype Y position in pixels from the top of the locked 1920px
   * canvas for the rehook pill.
   */
  rehookY?: number;
}

/** Fully resolved template — what render consumes. */
export interface ResolvedTemplate {
  archetype: Archetype;
  editStyleId: string;
  zoomStyle: EditStyle['defaultZoomStyle'];
  zoomIntensity: number;
  captionPosition: CaptionPosition;
  /** Hook title pill Y position in pixels from the top of the 1920px canvas. */
  hookTitleY: number;
  /** Rehook pill Y position in pixels from the top of the 1920px canvas. */
  rehookY: number;
  /**
   * Caption rendering mode for this archetype. `undefined` = default
   * multi-word grouping; `'word-by-word'` = one ASS event per word.
   */
  captionMode?: TemplateCaptionMode;
}

/** Picker-facing projection (includes display metadata). */
export interface EditStyleTemplateView {
  archetype: Archetype;
  editStyleId: string;
  name: string;
  description: string;
  category: SegmentStyleCategory;
  zoomStyle: EditStyle['defaultZoomStyle'];
  zoomIntensity: number;
  captionPosition: CaptionPosition;
}
