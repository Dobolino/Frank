import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { Button, Select, cx } from '../components/ui';
import { emptyYear } from '../seed/builders';
import { Dashboard } from '../features/Dashboard';
import { BudgetPage } from '../features/BudgetPage';
import { SalaryPage } from '../features/SalaryPage';
import { TaxPage } from '../features/TaxPage';
import { InvestPage } from '../features/InvestPage';
import { GoalsPage } from '../features/GoalsPage';
import { CashflowPage } from '../features/CashflowPage';
import { ComparePage } from '../features/ComparePage';
import { DataPage } from '../features/DataPage';
import { useSwipe } from './useSwipe';

const PAGES = [
  { id: 'overview', label: 'Übersicht', short: 'Übersicht', icon: '◎', Component: Dashboard },
  { id: 'budget', label: 'Budget', short: 'Budget', icon: '▤', Component: BudgetPage },
  { id: 'salary', label: 'Lohn', short: 'Lohn', icon: '₣', Component: SalaryPage },
  { id: 'tax', label: 'Steuern', short: 'Steuern', icon: '§', Component: TaxPage },
  { id: 'invest', label: 'Anlagen', short: 'Anlagen', icon: '↗', Component: InvestPage },
  { id: 'cashflow', label: 'Sparkonto', short: 'Sparkonto', icon: '⇄', Component: CashflowPage },
  { id: 'goals', label: 'Sparziele', short: 'Ziele', icon: '✈', Component: GoalsPage },
  { id: 'compare', label: 'Jahresvergleich', short: 'Vergleich', icon: '▥', Component: ComparePage },
  { id: 'data', label: 'Daten & KI', short: 'Daten', icon: '⤓', Component: DataPage },
] as const;

type PageId = (typeof PAGES)[number]['id'];

const pageFromHash = (): PageId => {
  const id = window.location.hash.replace('#', '');
  return (PAGES.find((p) => p.id === id)?.id ?? 'overview') as PageId;
};

const indexOf = (id: PageId) => PAGES.findIndex((p) => p.id === id);

export function App() {
  const { data, update, saveError } = useStore();
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onHash = () => {
      const next = pageFromHash();
      setPage((prev) => {
        if (prev !== next) setDirection(indexOf(next) > indexOf(prev) ? 'left' : 'right');
        return next;
      });
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Aktiven Tab in der unteren Leiste sichtbar halten
  useEffect(() => {
    tabRefs.current[page]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [page]);

  const go = (offset: number) => {
    const next = PAGES[indexOf(page) + offset];
    if (next) window.location.hash = next.id;
  };
  const swipe = useSwipe(contentRef, {
    onNext: () => go(1),
    onPrev: () => go(-1),
    canNext: indexOf(page) < PAGES.length - 1,
    canPrev: indexOf(page) > 0,
  });

  const years = Object.keys(data.years).map(Number).sort();
  const Current = PAGES.find((p) => p.id === page)!.Component;

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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Kopfzeile Handy */}
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-base leading-tight font-semibold tracking-tight">
              Frank<span className="text-accent">.</span>
            </div>
            <div className="truncate text-[11px] text-muted">{data.profile.municipality}</div>
          </div>
          {yearControls}
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
        <nav className="flex flex-col gap-1 px-3 pb-3">
          {PAGES.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
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

      <main className="min-w-0 flex-1 touch-pan-y overflow-x-hidden px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-10 md:py-8" {...swipe}>
        {saveError && <p className="mb-3 text-xs text-danger md:hidden">Speichern im Browser fehlgeschlagen – bitte Export nutzen.</p>}
        <div ref={contentRef} className="mx-auto max-w-6xl will-change-transform">
          <div key={page} className={cx(direction === 'left' && 'animate-page-left', direction === 'right' && 'animate-page-right')}>
            <Current />
          </div>
        </div>
      </main>

      {/* Tab-Leiste Handy */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur select-none md:hidden"
        aria-label="Seiten"
      >
        {PAGES.map((p) => (
          <a
            key={p.id}
            ref={(el) => void (tabRefs.current[p.id] = el)}
            href={`#${p.id}`}
            className={cx('flex min-w-[4.6rem] shrink-0 flex-col items-center gap-0.5 px-2 pt-2 pb-1.5 text-[11px]', page === p.id ? 'text-accent' : 'text-muted')}
            aria-current={page === p.id ? 'page' : undefined}
          >
            <span className="text-lg leading-none" aria-hidden>
              {p.icon}
            </span>
            {p.short}
          </a>
        ))}
      </nav>
    </div>
  );
}
