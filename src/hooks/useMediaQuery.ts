import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query.
 *
 * The mobile design is a structural redesign, not a narrower desktop — side panel becomes
 * a bottom sheet, the agent avatar moves above the text, buttons become icon-only touch
 * targets. CSS alone cannot express that, so the breakpoint is read in JS and the two
 * layouts render different trees.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // Sync once on mount: the query may have changed between render and effect.
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Single source of truth for the breakpoint, shared by the JS and CSS layers. */
export const MOBILE_QUERY = '(max-width: 720px)';

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
