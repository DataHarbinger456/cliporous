import { useEffect, useState } from 'react';

/** Subscribe to one CSS media query without making it part of persisted product state. */
export function useMediaQuery(query: string): boolean {
  const getMatch = (): boolean =>
    typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(query);
    const update = (): void => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
}
