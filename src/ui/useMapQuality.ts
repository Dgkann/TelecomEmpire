import { useEffect, useState } from 'react';

type Quality = 'auto' | 'full' | 'performance';
const KEY = 'telecom-empire-map-quality';
export function useMapQuality(siteCount: number) {
  const [quality, setQuality] = useState<Quality>(() => {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'full' || value === 'performance' ? value : 'auto';
    } catch {
      return 'auto';
    }
  });
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (quality !== 'auto') return;
    let raf = 0,
      last = 0,
      frames = 0,
      late = 0,
      windows = 0;
    const sample = (now: number) => {
      if (document.visibilityState === 'visible' && last) {
        frames++;
        if (now - last > 40) late++;
        if (frames >= 90) {
          // Require sustained trouble; recover only after three healthy windows.
          if (late > 12) {
            setSlow(true);
            windows = 0;
          } else if (late < 3 && ++windows >= 3) setSlow(false);
          frames = late = 0;
        }
      }
      last = now;
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, [quality]);
  const chooseQuality = (value: Quality) => {
    setQuality(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* Session preference still applies. */
    }
  };
  return {
    quality,
    chooseQuality,
    economical: quality === 'performance' || (quality === 'auto' && (slow || siteCount > 80)),
  };
}
