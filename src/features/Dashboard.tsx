import type { ReactNode } from 'react';
import { useStore } from '../app/store';
import { Card, Collapsible, Money, PageHeader, Select, Stat, Warnings, cx, formatChfShort, usePref } from './shared';
import { monthName } from '../domain/types';
import { formatPercent } from '../domain/money';
import { goalStatus } from '../domain/goalsEngine';
import { todayYm } from './shared';
import { CategoryDonut, MonthlyOutflowChart } from './charts';
import { BackupReminder } from './BackupReminder';
import { Pillar3aReminder } from './Pillar3aCard';
import { ComparePage } from './ComparePage';
import { summarizePortfolio } from '../domain/investEngine';

const CHARTS = ['category', 'month', 'salary'] as const;
type ChartId = (typeof CHARTS)[number];
const CHART_LABELS: Record<ChartId, string> = {
  category: 'Ausgaben nach Kategorie',
  month: 'Ausgaben pro Monat',
  salary: 'Lohn im Jahr',
};

/** Übersicht: Ergebnis zuerst, eine Grafik zur Auswahl, Kacheln zu den Seiten. */
export function Dashboard() {
  const { model, data } = useStore();
  const { summary, tax, transfers } = model;
  const [chart, setChart] = usePref<ChartId>('overview.chart', 'category', CHARTS);
  const goals = data.goals.map((g) => goalStatus(g, model.budget, todayYm()));
  const portfolio = summarizePortfolio(data.investments);
  const standingOrders = transfers.reduce((s, t) => s + t.standingOrder, 0);
  const goalsOk = goals.filter((g) => g.onTrack).length;
  const years = Object.keys(data.years).length;

  return (
    <>
      <PageHeader title={`Übersicht ${model.plan.year}`} />
      <BackupReminder />
      <Pillar3aReminder />
      <Warnings items={model.warnings} />

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Netto" sub="pro Monat" value={<Money value={summary.incomeMonthly} decimals={false} />} />
        <Stat label="Ausgaben" sub="pro Monat" value={<Money value={summary.expensesMonthly} decimals={false} />} />
        <Stat
          label="Rest" sub="pro Monat"
          value={<Money value={summary.saldoMonthly} decimals={false} />}
          tone={summary.saldoMonthly >= 0 ? 'good' : 'bad'}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Jahresüberschuss inkl. 13. Lohn und Bonus{' '}
        <Money value={summary.surplusYearly} decimals={false} className={summary.surplusYearly >= 0 ? 'text-accent' : 'text-danger'} /> · Sparquote{' '}
        {formatPercent(summary.savingsRate)}
      </p>

      <Card
        className="mt-4"
        title="Grafik"
        action={<Select value={chart} onChange={setChart} ariaLabel="Grafik wählen" options={CHARTS.map((c) => ({ value: c, label: CHART_LABELS[c] }))} />}
      >
        {chart === 'category' && <CategoryDonut categories={summary.categories} items={model.budget} />}
        {chart === 'month' && <MonthlyOutflowChart items={model.budget} />}
        {chart === 'salary' && <SalaryBars />}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile href="#tax" label="Steuern" value={<Money value={tax.total} decimals={false} />} sub={<>Rückstellung <Money value={model.taxProvisionSuggested} decimals={false} /> / Mt</>} />
        <Tile
          href="#savings"
          label="Sparen"
          value={<Money value={standingOrders} decimals={false} />}
          sub={transfers.length === 0 ? 'keine Daueraufträge' : goals.length > 0 ? `Daueraufträge / Mt · ${goalsOk} von ${goals.length} Zielen im Plan` : 'Daueraufträge / Mt'}
        />
        <Tile href="#salary" label="Lohn" value={<Money value={model.salary.totals.net} decimals={false} />} sub="Auszahlung im Jahr" />
        {portfolio.positions.length > 0 ? (
          <Tile
            href="#invest"
            label="Anlagen"
            value={<Money value={portfolio.totalChf} decimals={false} />}
            sub={<span className={portfolio.dayChangeChf >= 0 ? 'text-accent' : 'text-danger'}>Heute <Money value={portfolio.dayChangeChf} decimals={false} signed /></span>}
          />
        ) : (
          <Tile href="#budget" label="Budget" value={`${model.budget.length} Posten`} sub={`Fixkosten ${formatPercent(summary.fixedShare)}`} />
        )}
      </div>

      {years > 1 && (
        <div className="mt-4">
          <Collapsible summary={<span>Jahresvergleich <span className="text-muted">· {years} Jahre</span></span>}>
            <ComparePage embedded />
          </Collapsible>
        </div>
      )}
    </>
  );
}

function Tile({ href, label, value, sub }: { href: string; label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <a href={href} className="block rounded-2xl border border-line bg-panel p-4 transition-colors hover:bg-panel-2 active:bg-panel-2">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span aria-hidden>›</span>
      </div>
      <div className="num mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
    </a>
  );
}

function SalaryBars() {
  const { model } = useStore();
  const months = model.salary.months;
  const maxNet = Math.max(1, ...months.map((m) => m.net));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {months.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${monthName(m.month)}: ${formatChfShort(m.net)}`}>
            <div className="flex w-full flex-col justify-end" style={{ height: '8.5rem' }}>
              <div className="w-full rounded-t bg-accent/80" style={{ height: `${((m.net - m.extrasNet) / maxNet) * 100}%` }} />
              {m.extrasNet > 0 && <div className="order-first w-full rounded-t bg-info" style={{ height: `${(m.extrasNet / maxNet) * 100}%` }} />}
            </div>
            <span className="text-[10px] text-muted">{monthName(m.month).slice(0, 1)}</span>
          </div>
        ))}
      </div>
      <div className={cx('mt-2 flex gap-4 text-xs text-muted')}>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent/80" />Monatslohn</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-info" />13. Lohn / Bonus</span>
      </div>
    </div>
  );
}
