import { useStore } from '../app/store';
import { Card, Money, PageHeader, cx } from './shared';
import { formatPercent, type Rappen } from '../domain/money';
import type { YearModel } from '../domain/yearModel';

interface Metric {
  label: string;
  get: (m: YearModel) => Rappen | null;
  percent?: (m: YearModel) => number;
  invert?: boolean;
}

const METRICS: Metric[] = [
  { label: 'Bruttolohn', get: (m) => m.salary.totals.gross },
  { label: 'Nettolohn (ausbezahlt)', get: (m) => m.salary.totals.net },
  { label: 'Weitere Einkünfte', get: (m) => m.otherIncomeYearly },
  { label: 'Steuern berechnet', get: (m) => m.tax.total, invert: true },
  {
    label: 'Steuern tatsächlich',
    get: (m) => {
      const a = m.plan.actualTax;
      return a && (a.federal || a.cantonMunicipal) ? (a.federal ?? 0) + (a.cantonMunicipal ?? 0) : null;
    },
    invert: true,
  },
  { label: 'Ausgaben (Budget)', get: (m) => (m.plan.budget.length > 1 ? m.summary.expensesYearly : null), invert: true },
  { label: 'Sparen & Vorsorge', get: (m) => (m.plan.budget.length > 1 ? m.summary.savingsYearly : null) },
  { label: 'Jahresüberschuss', get: (m) => (m.plan.budget.length > 1 ? m.summary.surplusYearly : null) },
  { label: 'Sparquote', get: () => null, percent: (m) => m.summary.savingsRate },
];

function MetricValue({ metric, model, previous }: { metric: Metric; model: YearModel; previous?: YearModel }) {
  if (metric.percent) return <>{model.plan.budget.length > 1 ? formatPercent(metric.percent(model)) : '–'}</>;
  const value = metric.get(model);
  const before = previous ? metric.get(previous) : null;
  const delta = value !== null && before !== null && before !== 0 ? (value - before) / Math.abs(before) : null;
  const good = delta !== null && (metric.invert ? delta < 0 : delta > 0);
  return (
    <>
      {value === null ? <span className="text-muted">–</span> : <Money value={value} decimals={false} />}
      {delta !== null && Math.abs(delta) >= 0.005 && (
        <div className={cx('text-[11px]', good ? 'text-accent' : 'text-warn')}>
          {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)} %
        </div>
      )}
    </>
  );
}

export function ComparePage() {
  const { data, modelFor } = useStore();
  const models = Object.keys(data.years)
    .map(Number)
    .sort()
    .map((y) => modelFor(y))
    .filter((m): m is YearModel => !!m);
  const maxNet = Math.max(1, ...models.map((m) => m.salary.totals.gross));

  return (
    <>
      <PageHeader title="Jahresvergleich" subtitle="Entwicklung von Lohn, Steuern und Sparen über die Jahre." />
      <div className="space-y-4 md:hidden">
        {models.map((model, index) => (
          <Card key={model.plan.year} title={String(model.plan.year)} action={model.plan.year === data.activeYear ? <span className="text-xs text-accent">Aktuelles Jahr</span> : undefined}>
            <dl>
              {METRICS.map((metric) => (
                <div key={metric.label} className="flex items-start justify-between gap-3 border-t border-line/60 py-2 text-sm">
                  <dt className="min-w-0 text-muted">{metric.label}</dt>
                  <dd className="num shrink-0 text-right"><MetricValue metric={metric} model={model} previous={models[index - 1]} /></dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
      <Card className="hidden md:block">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Jahresvergleich">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-right text-xs text-muted">
                <th className="pb-2 text-left font-normal" />
                {models.map((m) => (
                  <th key={m.plan.year} className={cx('pb-2 font-semibold', m.plan.year === data.activeYear && 'text-accent')}>{m.plan.year}</th>
                ))}
              </tr>
            </thead>
            <tbody className="num text-right">
              {METRICS.map((metric) => (
                <tr key={metric.label} className="border-t border-line/60">
                  <td className="sticky left-0 z-10 bg-panel py-2 pr-3 text-left text-muted">{metric.label}</td>
                  {models.map((m, idx) => (
                    <td key={m.plan.year} className="py-2">
                      <MetricValue metric={metric} model={m} previous={models[idx - 1]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Brutto → Netto → Steuern" className="mt-4">
        <div className="space-y-4">
          {models.map((m) => (
            <div key={m.plan.year}>
              <div className="mb-1 text-sm text-muted">{m.plan.year}</div>
              <div className="flex h-5 overflow-hidden rounded-md bg-line" style={{ width: `${(m.salary.totals.gross / maxNet) * 100}%` }}>
                <div className="bg-accent/80" style={{ width: `${((m.salary.totals.net - m.tax.total) / Math.max(1, m.salary.totals.gross)) * 100}%` }} title="Netto nach Steuern" />
                <div className="bg-warn/80" style={{ width: `${(m.tax.total / Math.max(1, m.salary.totals.gross)) * 100}%` }} title="Steuern" />
                <div className="bg-info/60" style={{ width: `${((m.salary.totals.gross - m.salary.totals.net) / Math.max(1, m.salary.totals.gross)) * 100}%` }} title="Sozialabzüge & BVG" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent/80" />Netto nach Steuern</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-warn/80" />Steuern</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-info/60" />Sozialabzüge & BVG</span>
        </div>
      </Card>
    </>
  );
}
