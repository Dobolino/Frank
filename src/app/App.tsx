import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { useStore } from './store';
import { Button, Select, cx } from '../components/ui';
import { emptyYear } from '../seed/builders';
import { Dashboard } from '../features/Dashboard';
import { BudgetPage } from '../features/BudgetPage';
import { SalaryPage } from '../features/SalaryPage';
import { TaxPage } from '../features/TaxPage';
import { GoalsPage } from '../features/GoalsPage';
import { CashflowPage } from '../features/CashflowPage';
import { ComparePage } from '../features/ComparePage';
import { DataPage } from '../features/DataPage';

const PAGES = [
  { id: 'overview', label: 'Übersicht', icon: '◎', Component: Dashboard },
  { id: 'budget', label: 'Budget', icon: '▤', Component: BudgetPage },
  { id: 'salary', label: 'Lohn', icon: '₣', Component: SalaryPage },
  { id: 'tax', label: 'Steuern', icon: '§', Component: TaxPage },
  { id: 'cashflow', label: 'Sparkonto', icon: '⇄', Component: CashflowPage },
  { id: 'goals', label: 'Sparziele', icon: '✈', Component: GoalsPage },
  { id: 'compare', label: 'Jahresvergleich', icon: '▥', Component: ComparePage },
  { id: 'data', label: 'Daten & KI', icon: '⤓', Component: DataPage },
] as const;

type PageId = (typeof PAGES)[number]['id'];

const pageFromHash = (): PageId => {
  const id = window.location.hash.replace('#', '');
  return (PAGES.find((p) => p.id === id)?.id ?? 'overview') as PageId;
};

interface Swipe {
  x: number;
  y: number;
  started: number;
}

// Text fields, buttons and horizontal tables keep their own touch gestures.
function canSwipeFrom(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('input, select, textarea, button, a, label, summary, [role="switch"], [role="slider"], [contenteditable="true"], [data-no-swipe]')) return false;
  for (let element: HTMLElement | null = target; element && element.tagName !== 'MAIN'; element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(element).overflowX)) return false;
  }
  return !window.getSelection()?.toString();
}

export function App() {
  const { data, update, saveError } = useStore();
  const [{ page, direction }, setNavigation] = useState(() => ({ page: pageFromHash(), direction: 1 }));
  const [drag, setDrag] = useState(0);
  const swipe = useRef<Swipe | null>(null);
  const nav = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const index = PAGES.findIndex((p) => p.id === page);

  useEffect(() => {
    const onHash = () => {
      const next = pageFromHash();
      // A swipe/history change does not naturally blur a focused amount field.
      // Commit its draft before unmounting the current page.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches('input, textarea, select, [contenteditable="true"]')) focused.blur();
      setNavigation((previous) => ({
        page: next,
        direction: PAGES.findIndex((p) => p.id === next) >= PAGES.findIndex((p) => p.id === previous.page) ? 1 : -1,
      }));
      swipe.current = null;
      setDrag(0);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const strip = nav.current;
    const active = strip?.querySelector<HTMLAnchorElement>('[aria-current="page"]');
    if (!strip || !active || window.matchMedia('(min-width: 768px)').matches) return;
    strip.scrollTo({
      left: active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [page]);

  useEffect(() => {
    const surface = main.current;
    if (!surface) return;
    // React's delegated touch listeners are passive. Only a deliberate horizontal
    // page gesture suppresses browser scrolling; tables and vertical scroll stay native.
    const preventHorizontalScroll = (event: globalThis.TouchEvent) => {
      const start = swipe.current;
      const touch = event.touches[0];
      if (!start || !touch || event.touches.length !== 1) return;
      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      if (dx > 12 && dy < dx * 0.6 && event.cancelable) event.preventDefault();
    };
    surface.addEventListener('touchmove', preventHorizontalScroll, { passive: false });
    return () => surface.removeEventListener('touchmove', preventHorizontalScroll);
  }, []);

  const cancelSwipe = () => {
    swipe.current = null;
    setDrag(0);
  };
  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    cancelSwipe();
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1 || window.innerWidth >= 768 || !canSwipeFrom(event.target)) return;
    // Leave the screen edges to the browser's back/forward gestures.
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    swipe.current = { x: touch.clientX, y: touch.clientY, started: performance.now() };
  };
  const onTouchMove = (event: TouchEvent<HTMLElement>) => {
    const start = swipe.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (event.touches.length !== 1 || Math.abs(dy) > Math.max(16, Math.abs(dx) * 0.6)) {
      cancelSwipe();
      return;
    }
    const nextIndex = index + (dx < 0 ? 1 : -1);
    setDrag(nextIndex >= 0 && nextIndex < PAGES.length ? Math.max(-54, Math.min(54, dx * 0.25)) : 0);
  };
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = swipe.current;
    const touch = event.changedTouches[0];
    cancelSwipe();
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dy) > Math.abs(dx) * 0.6 || performance.now() - start.started > 900) return;
    const next = PAGES[index + (dx < 0 ? 1 : -1)];
    if (next) window.location.hash = next.id;
  };

  const years = Object.keys(data.years).map(Number).sort();
  const Current = PAGES.find((p) => p.id === page)!.Component;

  const addYear = () => {
    const last = Math.max(...years);
    update((d) => {
      d.years[String(last + 1)] = emptyYear(last + 1, d.years[String(last)]);
      d.activeYear = last + 1;
    });
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-[env(safe-area-inset-top)] z-20 border-b border-line bg-panel/95 backdrop-blur md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0 md:bg-panel">

        <div className="flex items-center justify-between gap-3 px-5 py-4 md:block">
          <div>
            <div className="text-lg font-semibold tracking-tight">
              Frank<span className="text-accent">.</span>
            </div>
            <div className="text-xs text-muted">Finanzen · {data.profile.municipality}</div>
          </div>
          <div className="flex items-center gap-2 md:mt-5">
            <Select
              ariaLabel="Jahr wählen"
              value={data.activeYear}
              options={years.map((y) => ({ value: y, label: String(y) }))}
              onChange={(y) => update((d) => void (d.activeYear = y))}
              className="md:flex-1"
            />
            <Button variant="ghost" title="Neues Jahr aus dem letzten Jahr anlegen" onClick={addYear}>
              + Jahr
            </Button>
          </div>
        </div>
        <nav ref={nav} aria-label="Hauptnavigation" className="page-tabs relative flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {PAGES.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              aria-current={page === p.id ? 'page' : undefined}
              className={cx(
                'relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                page === p.id ? 'bg-panel-2 text-text' : 'text-muted hover:bg-panel-2/60 hover:text-text',
              )}
            >
              <span className={cx('w-4 text-center', page === p.id && 'text-accent')} aria-hidden>
                {p.icon}
              </span>
              {p.label}
              {page === p.id && <span aria-hidden className="tab-indicator absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-accent md:inset-x-auto md:inset-y-2 md:bottom-auto md:left-0 md:h-auto md:w-0.5" />}
            </a>
          ))}
        </nav>
        <div className="flex items-center justify-between px-5 pb-2 text-[11px] text-muted md:hidden">
          <span>{index + 1} / {PAGES.length}</span>
          <span aria-hidden>← Wischen zum Wechseln →</span>
        </div>
        {saveError && <p className="px-5 pb-4 text-xs text-danger">Speichern im Browser fehlgeschlagen – bitte Export nutzen.</p>}
      </aside>
      <main
        ref={main}
        className="min-w-0 flex-1 overflow-x-clip px-4 py-6 md:px-10 md:py-8"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={cancelSwipe}
      >
        <div className="mx-auto max-w-6xl">
          <div className="page-drag" style={{ '--page-drag': `${drag}px`, '--page-opacity': 1 - Math.abs(drag) / 240 } as CSSProperties}>
            <div key={page} className="page-enter" style={{ '--page-direction': direction } as CSSProperties}>
              <Current />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
