import type { EditStyleTemplate } from '../../shared/types';

export const fullscreenImage: EditStyleTemplate = {
  archetype: 'fullscreen-image',
  zoomStyle: 'drift',
  zoomIntensity: 1.1,
  // B-roll keeps the same ordinary lower-third subtitle track.
  captionPosition: 'lower-third',
  hookTitleY: 220,
  rehookY: 220,
};
