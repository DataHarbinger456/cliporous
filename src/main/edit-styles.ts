/**
 * Edit-styles re-export shim. The implementation lives in
 * src/main/edit-styles/. Keep this file around for importers that still
 * reference the flat path (`../edit-styles`).
 */

export type {
  Archetype,
  EditStyleTemplate,
  EditStyleTemplateView,
  ResolvedTemplate,
} from './edit-styles/index';
export {
  ARCHETYPE_KEYS,
  ARCHETYPE_META,
  ARCHETYPE_TO_CATEGORY,
  DEFAULT_EDIT_STYLE_ID,
  EDIT_STYLES,
  getEditStyleById,
  getTemplatesForEditStyle,
  isSpeakerFullscreen,
  resolveTemplate,
  resolveTransition,
  SPEAKER_FULLSCREEN_ARCHETYPES,
  STYLE_TEMPLATES,
} from './edit-styles/index';
