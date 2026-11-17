import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { useStore } from './store';
import { Button, Select, cx } from '../components/ui';
import { emptyYear } from '../seed/builders';
import { Dashboard } from '../features/Dashboard';
import { BudgetPage } from '../features/BudgetPage';
import { SalaryPage } from '../features/SalaryPage';
import { TaxPage } from '../features/TaxPage';
import { InvestPage } from '../features/InvestPage';
import { SavingsPage } from '../features/SavingsPage';
import { DataPage } from '../features/DataPage';
import { Onboarding } from '../features/Onboarding';
import { haptic } from './haptics';
import { applyUpdate, useUpdateAvailable } from './pwaUpdate';

const PAGES = [
  { id: 'overview', label: 'Übersicht', short: 'Übersicht', icon: '◎', Component: Dashboard },
  { id: 'budget', label: 'Budget', short: 'Budget', icon: '▤', Component: BudgetPage },
  { id: 'salary', label: 'Lohn', short: 'Lohn', icon: '₣', Component: SalaryPage },
  { id: 'tax', label: 'Steuern', short: 'Steuern', icon: '§', Component: TaxPage },
  { id: 'invest', label: 'Anlagen', short: 'Anlagen', icon: '↗', Component: InvestPage },
  { id: 'savings', label: 'Sparen', short: 'Sparen', icon: '⇄', Component: SavingsPage },
] as const;

/** Nicht in der Tab-Leiste: über das Symbol in der Kopfzeile erreichbar. */
const DATA_PAGE = { id: 'data', label: 'Daten & KI', short: 'Daten', icon: '⤓', Component: DataPage } as const;

type PageId = (typeof PAGES)[number]['id'] | typeof DATA_PAGE.id;

/** Frühere Seiten-Adressen (Lesezeichen) zeigen auf die neue Seite. */
const ALIASES: Record<string, PageId> = { cashflow: 'savings', goals: 'savings', compare: 'overview' };

const pageFromHash = (): PageId => {
  const id = window.location.hash.replace('#', '');
  if (id === DATA_PAGE.id) return DATA_PAGE.id;
  return ALIASES[id] ?? (PAGES.find((p) => p.id === id)?.id ?? 'overview');
};

const orderOf = (id: PageId) => (id === DATA_PAGE.id ? PAGES.length : PAGES.findIndex((p) => p.id === id));

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
  const { data, update, saveError, firstRun } = useStore();
  const updateAvailable = useUpdateAvailable();
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
        direction: orderOf(next) >= orderOf(previous.page) ? 1 : -1,
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
    if (!touch || index < 0 || event.touches.length !== 1 || window.innerWidth >= 768 || !canSwipeFrom(event.target)) return;
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
    if (next) {
      haptic();
      window.location.hash = next.id;
    }
  };

  const years = Object.keys(data.years).map(Number).sort();
  const Current = page === DATA_PAGE.id ? DATA_PAGE.Component : PAGES.find((p) => p.id === page)!.Component;

  const addYear = () => {
    const last = Math.max(...years);
    update((d) => {
      d.years[String(last + 1)] = emptyYear(last + 1, d.years[String(last)]);
      d.activeYear = last + 1;
    });
  };

  const yearControls = (
    <div className="flex items-center gap-2">
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
  );

  if (firstRun) return <Onboarding />;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Kopfzeile Handy */}
      <header className="sticky top-0 z-30 isolate border-b border-line pt-[env(safe-area-inset-top)] md:hidden">
        {/* Safari zeichnet Text unscharf, wenn er im selben Element wie backdrop-filter liegt: Hintergrund als eigene Ebene */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-panel/95 backdrop-blur" />
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-base leading-tight font-semibold tracking-tight">
              Frank<span className="text-accent">.</span>
            </div>
            <div className="truncate text-[11px] text-muted">{data.profile.municipality}</div>
          </div>
          <div className="flex items-center gap-1">
            {yearControls}
            <a
              href={`#${DATA_PAGE.id}`}
              aria-label="Daten, Backup und KI"
              aria-current={page === DATA_PAGE.id ? 'page' : undefined}
              className={cx('flex h-9 w-9 items-center justify-center rounded-lg text-lg', page === DATA_PAGE.id ? 'bg-panel-2 text-accent' : 'text-muted')}
            >
              {DATA_PAGE.icon}
            </a>
          </div>
        </div>
        {/* Fortschritt: wo in der Seitenfolge du bist */}
        <div className="flex gap-1 px-4 pb-2" aria-hidden>
          {PAGES.map((p) => (
            <span key={p.id} className={cx('h-0.5 flex-1 rounded-full transition-colors', p.id === page ? 'bg-accent' : 'bg-line')} />
          ))}
        </div>
      </header>

      {/* Seitenleiste Desktop */}
      <aside className="hidden md:sticky md:top-0 md:block md:h-screen md:w-60 md:shrink-0 md:border-r md:border-line md:bg-panel">
        <div className="px-5 py-4">
          <div className="text-lg font-semibold tracking-tight">
            Frank<span className="text-accent">.</span>
          </div>
          <div className="text-xs text-muted">Finanzen · {data.profile.municipality}</div>
          <div className="mt-5">{yearControls}</div>
        </div>
        <nav aria-label="Hauptnavigation" className="flex flex-col gap-1 px-3 pb-3">
          {[...PAGES, DATA_PAGE].map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              aria-current={page === p.id ? 'page' : undefined}
              className={cx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                page === p.id ? 'bg-panel-2 text-text' : 'text-muted hover:bg-panel-2/60 hover:text-text',
              )}
            >
              <span className={cx('w-4 text-center', page === p.id && 'text-accent')} aria-hidden>
                {p.icon}
              </span>
              {p.label}
            </a>
          ))}
        </nav>
        {saveError && <p className="px-5 pb-4 text-xs text-danger">Speichern im Browser fehlgeschlagen – bitte Export nutzen.</p>}
      </aside>

      <main
        ref={main}
        className="min-w-0 flex-1 overflow-x-clip px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-10 md:py-8"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={cancelSwipe}
      >
        <div className="mx-auto max-w-6xl">
          {updateAvailable && (
            <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
              <span>Neue Version von Frank bereit.</span>
              <Button variant="primary" onClick={applyUpdate}>
                Neu laden
              </Button>
            </div>
          )}
          <div className="page-drag" style={{ '--page-drag': `${drag}px`, '--page-opacity': 1 - Math.abs(drag) / 240 } as CSSProperties}>
            <div key={page} className="page-enter" style={{ '--page-direction': direction } as CSSProperties}>
              <Current />
            </div>
          </div>
        </div>
      </main>

      {/* Tab-Leiste Handy */}
      <nav
        ref={nav}
        className="page-tabs fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur select-none md:hidden"
        aria-label="Seiten"
      >
        {PAGES.map((p) => (
          <a
            key={p.id}
            href={`#${p.id}`}
            className={cx('relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[11px]', page === p.id ? 'text-accent' : 'text-muted')}
            aria-current={page === p.id ? 'page' : undefined}
            onClick={() => page !== p.id && haptic()}
          >
            <span className="text-lg leading-none" aria-hidden>
              {p.icon}
            </span>
            {p.short}
            {page === p.id && <span aria-hidden className="tab-indicator absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" />}
          </a>
        ))}
      </nav>
    </div>
  );
}
