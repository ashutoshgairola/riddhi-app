import { useEffect, useState } from 'react';
export function useCountUp(target: number, duration = 900, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0, timer: any, fallback: any;
    timer = setTimeout(() => {
      const start = Date.now();
      const tick = () => {
        const t = Math.min((Date.now() - start) / duration, 1);
        const eased = 1 - Math.pow(2, -10 * t);
        setVal(Math.round(target * eased));
        if (t < 1) raf = requestAnimationFrame(tick); else setVal(target);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    fallback = setTimeout(() => setVal(target), delay + duration + 80);
    return () => { clearTimeout(timer); clearTimeout(fallback); cancelAnimationFrame(raf); };
  }, [target]);
  return val;
}
