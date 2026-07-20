// ---------------------------------------------------------------------------
// HyperFrames overlay system — barrel export
// ---------------------------------------------------------------------------

export type { RenderCompositionOptions, RenderCompositionResult } from './engine';
export { renderComposition, resolveHyperFramesCli } from './engine';
export {
  listPresets,
  renderOverlay,
  renderOverlays,
  renderPreset,
  resolvePreset,
} from './renderer';
export type {
  BaseOverlayProps,
  HyperFramePreset,
  OverlayBlockName,
  OverlayPosition,
  OverlayRenderResult,
  OverlayRequest,
  OverlayTiming,
  PresetCategory,
  PresetMetadata,
} from './types';
