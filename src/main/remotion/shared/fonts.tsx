import type React from 'react';
import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

/**
 * Families declared below. Each is preloaded before the first frame is
 * captured so headless renders never snap a frame while a custom face is still
 * downloading — that race is what made the browser fall back to its default
 * serif (Times) instead of, e.g., Anton.
 *
 * `Instrument Serif` ships italic-only, so it is queried with the italic style
 * descriptor; the rest are normal weight 400 (Geist is 700).
 */
const FONT_LOAD_QUERIES = [
  "700 100px 'Geist'",
  "400 100px 'Anton'",
  "400 100px 'Style Script'",
  "400 100px 'Bebas Neue'",
  "italic 400 100px 'Instrument Serif'",
  "400 100px 'JetBrains Mono'",
];

/**
 * Local @font-face declarations using the bundled TTFs in `resources/fonts/`.
 * `Config.setPublicDir('./resources')` in remotion.config.ts makes
 * `staticFile('fonts/...')` resolve correctly in both Studio and headless
 * render.
 *
 * Mounting this also gates Remotion's frame capture (`delayRender`) until every
 * face is actually loaded, so the correct typeface is painted from frame 0.
 *
 * Mount this once at the top of every composition.
 */
export const PrestyjFonts: React.FC = () => {
  const [handle] = useState(() => delayRender('Loading PRESTYJ fonts'));

  useEffect(() => {
    let cancelled = false;
    // Load each face independently and swallow per-font failures: a font that
    // cannot be fetched (e.g. a NetworkError when the headless render can't
    // reach the served TTF) must NOT abort the entire clip render. Losing one
    // custom typeface to a system fallback is far better than failing the whole
    // render via cancelRender(). We always continueRender() once the loads
    // settle so the frame capture proceeds either way.
    Promise.all(
      FONT_LOAD_QUERIES.map((q) =>
        document.fonts.load(q).catch((err) => {
          console.warn(`[PrestyjFonts] Font failed to load (${q}); using fallback:`, err);
          return undefined;
        }),
      ),
    )
      .then(() => document.fonts.ready)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <style>{`
    @font-face {
      font-family: 'Geist';
      src: url('${staticFile('fonts/Geist-Bold.ttf')}') format('truetype');
      font-weight: 700;
      font-display: block;
    }
    @font-face {
      font-family: 'Anton';
      src: url('${staticFile('fonts/Anton-Regular.ttf')}') format('truetype');
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: 'Style Script';
      src: url('${staticFile('fonts/StyleScript-Regular.ttf')}') format('truetype');
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: 'Bebas Neue';
      src: url('${staticFile('fonts/BebasNeue-Regular.ttf')}') format('truetype');
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: 'Instrument Serif';
      src: url('${staticFile('fonts/InstrumentSerif-Italic.ttf')}') format('truetype');
      font-weight: 400;
      font-style: italic;
      font-display: block;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('${staticFile('fonts/JetBrainsMono.ttf')}') format('truetype');
      font-weight: 400;
      font-display: block;
    }
  `}</style>
  );
};
