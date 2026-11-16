import { useState } from 'react';
import { Money, cx } from './shared';
import { formatPercent, sum, type Rappen } from '../domain/money';
import { CATEGORY_LABELS, monthName, type BudgetCategory, type BudgetItem } from '../domain/types';
import { frequencyLabel, monthlyAmount, outflowsByMonth } from '../domain/budgetEngine';

/**
 * Kategorie-Farben: feste Reihenfolge, geprüft für Farbsehschwäche auf dem dunklen Hintergrund
 * (dataviz-Validator: CVD ΔE ≥ 8.4, Kontrast ≥ 3:1). Die Farbe folgt der Kategorie, nie dem Rang.
 */
export const CATEGORY_COLORS: Record<BudgetCategory, string> = {
  fixed: '#3987e5',
  household: '#d95926',
  personal: '#199e70',
  mobility: '#c98500',
  savings: '#d55181',
};

const ORDER: BudgetCategory[] = ['fixed', 'household', 'personal', 'mobility', 'savings'];

function Swatch({ category }: { category: BudgetCategory }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[category] }} />;
}

/** Ring: Anteil jeder Kategorie an den Ausgaben pro Monat. Antippen zeigt den Betrag in der Mitte. */
export function CategoryDonut({ categories, items: budget = [] }: { categories: { category: BudgetCategory; monthly: Rappen }[]; items?: BudgetItem[] }) {
  const [active, setActive] = useState<BudgetCategory | null>(null);
  const items = ORDER.map((c) => categories.find((x) => x.category === c)).filter((x): x is { category: BudgetCategory; monthly: Rappen } => !!x && x.monthly > 0);
  const total = sum(items.map((i) => i.monthly));
  if (total <= 0) return <p className="text-sm text-muted">Noch keine Ausgaben im Budget.</p>;

  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = items.length > 1 ? 1.2 : 0;
  let offset = 0;
  const shown = active ? items.find((i) => i.category === active) : undefined;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:flex-wrap sm:items-center">
 <svg viewBox="-6 -6 112 112" className="h-48 w-48 shrink-0 -rotate-90 overflow-visible" role="img" aria-label="Ausgaben nach Kategorie">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-panel-2)" strokeWidth="12" />
        {items.map((i) => {
          const len = (i.monthly / total) * c;
          // Ausgewählter Teil rückt nach aussen
          const mid = ((offset + len / 2) / c) * 2 * Math.PI;
          const pop = active === i.category ? 4 : 0;
          const seg = (
            <circle
              key={i.category}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={CATEGORY_COLORS[i.category]}
              style={{ transform: `translate(${Math.cos(mid) * pop}px, ${Math.sin(mid) * pop}px)`, transition: 'transform 200ms ease-out, stroke-width 200ms ease-out, opacity 200ms' }}
              strokeWidth={active === i.category ? 16 : 12}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-offset}
              opacity={active && active !== i.category ? 0.35 : 1}
              className="cursor-pointer transition-all"
              onClick={() => setActive(active === i.category ? null : i.category)}
            >
              <title>{`${CATEGORY_LABELS[i.category]}: ${formatPercent(i.monthly / total, 0)}`}</title>
            </circle>
          );
          offset += len;
          return seg;
        })}
        <g className="rotate-90" style={{ transformOrigin: '50px 50px' }}>
          <text x="50" y="47" textAnchor="middle" className="fill-[var(--color-muted)] text-[6px]">
            {shown ? CATEGORY_LABELS[shown.category] : 'pro Monat'}
          </text>
          <text x="50" y="58" textAnchor="middle" className="num fill-[var(--color-text)] text-[10px] font-semibold">
            {Math.round((shown?.monthly ?? total) / 100).toLocaleString('de-CH').replace(/’/g, "'")}
          </text>
        </g>
      </svg>
      <ul className="w-full space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i.category}>
            <button
              type="button"
              className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left', active === i.category && 'bg-panel-2')}
              onClick={() => setActive(active === i.category ? null : i.category)}
            >
              <Swatch category={i.category} />
              <span className="flex-1">{CATEGORY_LABELS[i.category]}</span>
              <span className="num text-muted">{formatPercent(i.monthly / total, 0)}</span>
              <span className="num w-20 text-right"><Money value={i.monthly} decimals={false} /></span>
            </button>
          </li>
        ))}
      </ul>
      {shown && budget.length > 0 && <CategoryItems category={shown.category} total={shown.monthly} items={budget} />}
    </div>
  );
}

/** Posten einer Kategorie mit Betrag pro Monat, grösste zuerst. */
function CategoryItems({ category, total, items }: { category: BudgetCategory; total: Rappen; items: BudgetItem[] }) {
  const rows = items
    .filter((i) => i.category === category)
    .map((i) => ({ item: i, monthly: monthlyAmount(i) }))
    .filter((r) => r.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  return (
    <div className="w-full rounded-xl bg-panel-2 p-3 text-sm sm:basis-full">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <Swatch category={category} /> {CATEGORY_LABELS[category]}
      </div>
      <ul className="space-y-2">
        {rows.map(({ item, monthly }) => (
          <li key={item.id}>
            <div className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{item.name}</span>
              <span className="num shrink-0"><Money value={monthly} decimals={false} /> / Mt</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-bg">
              <div className="h-1 rounded-full" style={{ width: `${(monthly / total) * 100}%`, background: CATEGORY_COLORS[category] }} />
            </div>
            {item.frequency.kind !== 'monthly' && (
              <div className="mt-0.5 text-xs text-muted">
                {frequencyLabel(item.frequency)}: <Money value={item.amount} decimals={false} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Gestapelte Monatsbalken: wann wie viel abfliesst. Jahresrechnungen werden als Spitzen sichtbar. */
export function MonthlyOutflowChart({ items }: { items: BudgetItem[] }) {
  const [active, setActive] = useState<number | null>(null);
  const months = Array.from({ length: 12 }, (_, m) => {
    const byCat = ORDER.map((category) => ({
      category,
      amount: sum(items.filter((i) => i.category === category).map((i) => outflowsByMonth(i)[m] ?? 0)),
    })).filter((x) => x.amount > 0);
    return { month: m + 1, byCat, total: sum(byCat.map((x) => x.amount)) };
  });
  const max = Math.max(1, ...months.map((m) => m.total));
  const avg = sum(months.map((m) => m.total)) / 12;
  const used = ORDER.filter((c) => months.some((m) => m.byCat.some((x) => x.category === c)));
  const sel = active === null ? null : months[active]!;
  const selItems = sel
    ? items
        .map((i) => ({ item: i, amount: outflowsByMonth(i)[sel.month - 1] ?? 0 }))
        .filter((x) => x.amount > 0)
        .sort((a, b) => b.amount - a.amount)
    : [];

  return (
    <div>
      <div className="mb-2 min-h-10 text-sm">
        {sel ? (
          <div>
            <span className="font-semibold">{monthName(sel.month as never)}</span> <Money value={sel.total} decimals={false} />
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
              {sel.byCat.map((x) => (
                <span key={x.category} className="inline-flex items-center gap-1">
                  <Swatch category={x.category} /> {CATEGORY_LABELS[x.category]} <Money value={x.amount} decimals={false} />
                </span>
              ))}
            </div>
          </div>
        ) : (
          <span className="text-muted">
            Durchschnitt <Money value={Math.round(avg)} decimals={false} /> pro Monat. Tippe auf einen Monat für Details.
          </span>
        )}
      </div>
      <div className="relative flex h-40 items-end gap-1" role="img" aria-label="Ausgaben pro Monat nach Kategorie">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(avg / max) * 100}%` }} />
        {months.map((m, idx) => (
          <button
            key={m.month}
            type="button"
            aria-label={`${monthName(m.month as never)}: ${Math.round(m.total / 100)} Franken`}
            className="flex h-full flex-1 items-end"
            onClick={() => setActive(active === idx ? null : idx)}
          >
            <div
              className={cx('flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] transition-opacity', active !== null && active !== idx && 'opacity-40')}
              style={{ height: `${(m.total / max) * 100}%` }}
            >
              {m.byCat.map((x) => (
                <div key={x.category} style={{ height: `${(x.amount / m.total) * 100}%`, background: CATEGORY_COLORS[x.category] }} />
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[10px] text-muted">
        {months.map((m) => (
          <span key={m.month} className="flex-1">{monthName(m.month as never).slice(0, 1)}</span>
        ))}
      </div>
      {sel && (
        <ul className="mt-3 space-y-1.5 rounded-xl bg-panel-2 p-3 text-sm">
          {selItems.map(({ item, amount }) => (
            <li key={item.id} className="flex items-center gap-2">
              <Swatch category={item.category} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.frequency.kind !== 'monthly' && <span className="shrink-0 text-xs text-warn">{frequencyLabel(item.frequency)}</span>}
              <span className="num shrink-0"><Money value={amount} decimals={false} /></span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {used.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <Swatch category={c} /> {CATEGORY_LABELS[c]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-3 border-t border-dashed border-muted" /> Durchschnitt
        </span>
      </div>
    </div>
  );
}
