import type { EditStyleTemplate } from '../../shared/types';

export const fullscreenQuote: EditStyleTemplate = {
  archetype: 'fullscreen-quote',
  zoomStyle: 'none',
  // The transcript itself is centered full-frame hero typography.
  captionPosition: 'center',
  hookTitleY: 220,
  rehookY: 220,
  // Hero archetype: emit one ASS dialogue event per word so each word
  // appears/disappears on its own ASR timestamp for maximum emphasis.
  captionMode: 'word-by-word',
};
