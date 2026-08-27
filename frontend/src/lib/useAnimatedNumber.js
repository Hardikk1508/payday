import { useEffect, useRef, useState } from "react";

const reduceMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Tweens a displayed number toward `target` instead of snapping to it --
// the race updates its totals every 260ms as the day advances, so without
// this the counters would just jump in place. Skips the tween entirely
// under prefers-reduced-motion.
export function useAnimatedNumber(target, duration = 500) {
  const [display, setDisplay] = useState(target);
  const frame = useRef(null);
  const from = useRef(target);

  useEffect(() => {
    if (reduceMotion()) {
      setDisplay(target);
      from.current = target;
      return;
    }

    const start = performance.now();
    const startValue = from.current;
    const delta = target - startValue;

    if (delta === 0) return;

    cancelAnimationFrame(frame.current);

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const value = startValue + delta * eased;
      setDisplay(value);
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        from.current = target;
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return display;
}
