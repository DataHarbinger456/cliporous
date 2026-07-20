// ---------------------------------------------------------------------------
// Ambient global types for the main process.
//
// Several main-process files reference shared domain types (EditStyle,
// SegmentStyleVariant, TransitionType, etc.) without importing them — this
// matches the convention used in the original BatchContent codebase.  This
// file re-publishes the canonical definitions from `@shared/types` as global
// type aliases so those files type-check without requiring an import per
// usage site.
//
// IMPORTANT: This file declares no runtime values.  It only adds type names
// to the global scope at compile time.
// ---------------------------------------------------------------------------

import type {
  Archetype as _Archetype,
  CaptionAnimation as _CaptionAnimation,
  CaptionStyleInput as _CaptionStyleInput,
  ColorGradeParams as _ColorGradeParams,
  EditStyle as _EditStyle,
  EmphasizedWord as _EmphasizedWord,
  HeadlineStyleConfig as _HeadlineStyleConfig,
  OverlayBlendMode as _OverlayBlendMode,
  SegmentStyleCategory as _SegmentStyleCategory,
  ShotBreakReason as _ShotBreakReason,
  ShotSegment as _ShotSegment,
  ShotSegmentationResult as _ShotSegmentationResult,
  TextAnimationStyle as _TextAnimationStyle,
  TransitionType as _TransitionType,
  VFXOverlay as _VFXOverlay,
  VFXOverlayType as _VFXOverlayType,
  VideoSegment as _VideoSegment,
  WordTimestamp as _WordTimestamp,
  ZoomKeyframe as _ZoomKeyframe,
} from '@shared/types';

declare global {
  type EditStyle = _EditStyle;
  type SegmentStyleCategory = _SegmentStyleCategory;
  type TransitionType = _TransitionType;
  type Archetype = _Archetype;
  type CaptionStyleInput = _CaptionStyleInput;
  type HeadlineStyleConfig = _HeadlineStyleConfig;
  type TextAnimationStyle = _TextAnimationStyle;
  type ColorGradeParams = _ColorGradeParams;
  type VFXOverlay = _VFXOverlay;
  type VFXOverlayType = _VFXOverlayType;
  type OverlayBlendMode = _OverlayBlendMode;
  type ZoomKeyframe = _ZoomKeyframe;
  type VideoSegment = _VideoSegment;
  type ShotSegment = _ShotSegment;
  type ShotBreakReason = _ShotBreakReason;
  type ShotSegmentationResult = _ShotSegmentationResult;
  type WordTimestamp = _WordTimestamp;
  type EmphasizedWord = _EmphasizedWord;
  type CaptionAnimation = _CaptionAnimation;
}
