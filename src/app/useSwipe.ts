import { useRef, type RefObject, type TouchEvent } from 'react';

interface Options {
  onNext: () => void;
  onPrev: () => void;
  canNext: boolean;
  canPrev: boolean;
}

/** Ab dieser Distanz (px) wechselt die Seite. */
const THRESHOLD = 70;
/** Erst nach so viel Bewegung entscheidet sich, ob horizontal oder vertikal gewischt wird. */
const LOCK_DISTANCE = 10;

/** Elemente, in denen Wischen eine eigene Bedeutung hat. */
const IGNORE = 'input[type="range"], textarea, [contenteditable], [data-noswipe]';

/** Nächstes Element, das selbst horizontal scrollt (z. B. breite Tabelle). */
function horizontalScroller(el: Element | null, stop: Element): Element | null {
  for (let e = el; e && e !== stop; e = e.parentElement) {
    const style = getComputedStyle(e);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 2) return e;
  }
  return null;
}

/** Kann der Bereich in Wischrichtung noch scrollen? Dann gehört die Geste ihm, nicht dem Seitenwechsel. */
function canScroll(el: Element, dx: number, startLeft: number): boolean {
  return dx < 0 ? startLeft + el.clientWidth < el.scrollWidth - 2 : startLeft > 2;
}

/**
 * Wischen nach links/rechts wechselt zur nächsten/vorherigen Seite.
 * Der Inhalt folgt dem Finger, damit es sich wie eine App anfühlt.
 */
export function useSwipe(content: RefObject<HTMLElement | null>, o: Options) {
  const s = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null; active: boolean; scroller: Element | null; scrollLeft: number }>({
    x: 0,
    y: 0,
    t: 0,
    axis: null,
    active: false,
    scroller: null,
    scrollLeft: 0,
  });

  const setOffset = (dx: number, animate: boolean) => {
    const el = content.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 180ms ease-out' : 'none';
    el.style.transform = dx ? `translateX(${dx}px)` : '';
  };

  return {
    onTouchStart(e: TouchEvent) {
      const target = e.target as Element;
      const t = e.touches[0];
      if (!t || e.touches.length > 1 || target.closest(IGNORE)) {
        s.current.active = false;
        return;
      }
      const scroller = horizontalScroller(target, e.currentTarget);
      s.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: null, active: true, scroller, scrollLeft: scroller?.scrollLeft ?? 0 };
    },
    onTouchMove(e: TouchEvent) {
      const st = s.current;
      const t = e.touches[0];
      if (!st.active || !t) return;
      const dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      if (!st.axis) {
        if (Math.abs(dx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE) return;
        st.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        if (st.axis === 'x' && st.scroller && canScroll(st.scroller, dx, st.scrollLeft)) {
          st.active = false;
          return;
        }
      }
      if (st.axis !== 'x') return;
      // Am Anfang/Ende nur leicht nachgeben
      const blocked = (dx < 0 && !o.canNext) || (dx > 0 && !o.canPrev);
      setOffset(blocked ? dx * 0.15 : dx * 0.6, false);
    },
    onTouchEnd(e: TouchEvent) {
      const st = s.current;
      const t = e.changedTouches[0];
      if (!st.active || !t) return;
      st.active = false;
      const dx = t.clientX - st.x;
      const fast = Date.now() - st.t < 300 && Math.abs(dx) > 40;
      setOffset(0, true);
      if (st.axis !== 'x' || (Math.abs(dx) < THRESHOLD && !fast)) return;
      if (dx < 0 && o.canNext) o.onNext();
      if (dx > 0 && o.canPrev) o.onPrev();
    },
    onTouchCancel() {
      s.current.active = false;
      setOffset(0, true);
    },
  };
}
