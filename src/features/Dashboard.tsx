import { useStore } from '../app/store';
import { Bar, Card, Money, PageHeader, Row, Stat, Warnings, formatChfShort } from './shared';
import { CATEGORY_LABELS, monthName } from '../domain/types';
import { formatPercent } from '../domain/money';
import { goalStatus } from '../domain/goalsEngine';
import { todayYm } from './shared';

export function Dashboard() {
  const { model, data } = useStore();
  const { summary, salary, tax, transfers } = model;
  const maxNet = Math.max(...salary.months.map((m) => m.net));
  const goals = data.goals.map((g) => goalStatus(g, model.budget, todayYm()));

  return (
    <>
      <PageHeader title={`Übersicht ${model.plan.year}`} subtitle="Monat, Jahr, Steuern und Sparkonto auf einen Blick." />
      <Warnings items={model.warnings} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Netto pro Monat" value={<Money value={summary.incomeMonthly} />} sub="ohne 13. Lohn / Bonus" />
        <Stat label="Ausgaben pro Monat" value={<Money value={summary.expensesMonthly} />} sub="inkl. Sparen & Vorsorge" />
        <Stat
          label="Rest pro Monat"
          value={<Money value={summary.saldoMonthly} />}
          tone={summary.saldoMonthly >= 0 ? 'good' : 'bad'}
          sub="nicht verplant"
        />
        <Stat
          label="Jahresüberschuss"
          value={<Money value={summary.surplusYearly} decimals={false} />}
          tone={summary.surplusYearly >= 0 ? 'good' : 'bad'}
          sub="inkl. 13. Lohn, Bonus, Dividenden"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Wohin das Geld geht" className="lg:col-span-2">
          <div className="space-y-3">
            {summary.categories.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{CATEGORY_LABELS[c.category]}</span>
                  <span className="num text-muted">
                    <Money value={c.monthly} /> / Mt · {summary.incomeMonthly > 0 ? formatPercent(c.monthly / summary.incomeMonthly, 0) : '–'}
                  </span>
                </div>
                <Bar value={summary.incomeMonthly > 0 ? c.monthly / summary.incomeMonthly : 0} tone={c.category === 'savings' ? 'good' : 'info'} />
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-muted">Sparquote</div>
              <div className="num text-lg font-semibold text-accent">{formatPercent(summary.savingsRate)}</div>
            </div>
            <div>
              <div className="text-muted">Fixkostenanteil</div>
              <div className="num text-lg font-semibold">{formatPercent(summary.fixedShare)}</div>
            </div>
            <div>
              <div className="text-muted">Gespart pro Jahr</div>
              <div className="num text-lg font-semibold">
                <Money value={summary.savingsYearly} decimals={false} />
              </div>
            </div>
          </div>
        </Card>

        <Card title="Steuern">
          <Row label="Bund" value={<Money value={tax.federal.tax} />} />
          <Row label="Kanton BL" value={<Money value={tax.canton.cantonTax} />} />
          <Row label="Gemeinde" value={<Money value={tax.canton.municipalTax} />} />
          {tax.wealthTaxTotal > 0 && <Row label="Vermögenssteuer" value={<Money value={tax.wealthTaxTotal} />} />}
          <Row label="Total" strong value={<Money value={tax.total} />} />
          <div className="mt-3 rounded-xl bg-panel-2 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Empfohlen pro Monat</span>
              <Money value={model.taxProvisionSuggested} className="font-semibold text-accent" />
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted">Budgetiert</span>
              <Money value={model.taxProvisionBudgeted} />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Lohn im Jahresverlauf" className="lg:col-span-2">
          <div className="flex h-40 items-end gap-1.5">
            {salary.months.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${monthName(m.month)}: ${formatChfShort(m.net)}`}>
                <div className="flex w-full flex-col justify-end" style={{ height: '8.5rem' }}>
                  <div className="w-full rounded-t bg-accent/80" style={{ height: `${((m.net - m.extrasNet) / maxNet) * 100}%` }} />
                  {m.extrasNet > 0 && <div className="order-first w-full rounded-t bg-info" style={{ height: `${(m.extrasNet / maxNet) * 100}%` }} />}
                </div>
                <span className="text-[10px] text-muted">{monthName(m.month)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent/80" />Monatslohn</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-info" />13. Lohn / Bonus</span>
          </div>
        </Card>

        <Card title="Daueraufträge">
          {transfers.length === 0 && <p className="text-sm text-muted">Noch keine Posten einem Sparkonto zugeordnet.</p>}
          {transfers.map((t) => (
            <Row key={t.account.id} label={t.account.name} hint={`${t.items.length} Posten`} value={<Money value={t.standingOrder} decimals={false} />} />
          ))}
          {goals.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-line pt-3">
              {goals.map((g) => (
                <div key={g.goal.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{g.goal.emoji} {g.goal.name}</span>
                    <span className="num text-muted">{formatPercent(g.progress, 0)}</span>
                  </div>
                  <Bar value={g.progress} tone={g.onTrack ? 'good' : 'warn'} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
