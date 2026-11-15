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
      <Card>
        <div className="overflow-x-auto">
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
                  <td className="py-2 text-left text-muted">{metric.label}</td>
                  {models.map((m, idx) => {
                    if (metric.percent) {
                      const ok = m.plan.budget.length > 1;
                      return <td key={m.plan.year}>{ok ? formatPercent(metric.percent(m)) : '–'}</td>;
                    }
                    const v = metric.get(m);
                    const prev = idx > 0 ? metric.get(models[idx - 1]!) : null;
                    const delta = v !== null && prev !== null && prev !== 0 ? (v - prev) / Math.abs(prev) : null;
                    const good = delta !== null && (metric.invert ? delta < 0 : delta > 0);
                    return (
                      <td key={m.plan.year} className="py-2">
                        {v === null ? <span className="text-muted">–</span> : <Money value={v} decimals={false} />}
                        {delta !== null && Math.abs(delta) >= 0.005 && (
                          <div className={cx('text-[11px]', good ? 'text-accent' : 'text-warn')}>
                            {delta > 0 ? '+' : ''}
                            {(delta * 100).toFixed(1)} %
                          </div>
                        )}
                      </td>
                    );
                  })}
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
                <div className="bg-accent/80" style={{ width: `${((m.salary.totals.net - m.tax.total) / m.salary.totals.gross) * 100}%` }} title="Netto nach Steuern" />
                <div className="bg-warn/80" style={{ width: `${(m.tax.total / m.salary.totals.gross) * 100}%` }} title="Steuern" />
                <div className="bg-info/60" style={{ width: `${((m.salary.totals.gross - m.salary.totals.net) / m.salary.totals.gross) * 100}%` }} title="Sozialabzüge & BVG" />
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
