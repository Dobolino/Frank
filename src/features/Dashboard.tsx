import type { ReactNode } from 'react';
import { useStore } from '../app/store';
import { FrankIcon } from '../components/FrankIcon';
import { YearPicker } from '../components/YearPicker';
import { yearlyByTaxTag } from '../domain/budgetEngine';
import { plannedContracts } from '../domain/contracts';
import { expensePeriod } from '../domain/expensePeriod';
import { upcomingBills } from '../domain/radarEngine';
import { CATEGORY_LABELS, monthName, type BudgetCategory, type BudgetItem, type Transaction } from '../domain/types';
import { summarizePortfolio } from '../domain/investEngine';
import { Card, Collapsible, Money, Select, Warnings, cx, formatChfShort, todayYm, usePref } from './shared';
import { CategoryDonut, MonthlyOutflowChart, CATEGORY_COLORS } from './charts';
import { ComparePage } from './ComparePage';
import { RadarCard } from './RadarCard';
import { BackupReminder } from './BackupReminder';
import { Pillar3aReminder } from './Pillar3aCard';
import './dashboard.css';

const CHARTS = ['category', 'month', 'salary'] as const;
type ChartId = (typeof CHARTS)[number];
const CHART_LABELS: Record<ChartId, string> = {
  category: 'Ausgaben nach Kategorie',
  month: 'Ausgaben pro Monat',
  salary: 'Auszahlungen im Jahr',
};

function monthLabel(ym: string, short = false) {
  const [year, month] = ym.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('de-CH', { month: short ? 'short' : 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function SectionLink({ children, label, href }: { children: ReactNode; label: string; href: string }) {
  return <a className="home-panel home-link" href={href}>
    <div className="home-panel-title"><h2>{label}</h2><FrankIcon name="forward" size={15}/></div>
    {children}
  </a>;
}

function SpendingPreview({ budget, transactions, ym }: { budget: BudgetItem[]; transactions: Transaction[]; ym: string }) {
  const actual = expensePeriod(budget, transactions, ym);
  const totals = new Map<BudgetCategory | 'other', { plan: number; spent: number }>();
  for (const row of actual.rows) {
    const old = totals.get(row.category) ?? { plan: 0, spent: 0 };
    totals.set(row.category, { plan: old.plan + row.planned, spent: old.spent + row.spent });
  }
  const groups = [...totals.entries()].filter(([,c]) => c.spent > 0).sort((a,b) =>
    (b[1].spent - b[1].plan) - (a[1].spent - a[1].plan)).slice(0,3);
  return <SectionLink href="#expenses" label="Ausgaben">
    <p className="home-caption">{monthLabel(ym)} · erfasste Buchungen</p>
    {transactions.length > 0 ? <>
      <p className="home-spent"><small>CHF</small> <Money value={actual.spent}/></p>
      {groups.length > 0 && <div className="home-meters">
        {groups.map(([category, item]) => <div key={category}>
          <div className="home-meter-label"><span>{category === 'other' ? 'Weitere Posten' : CATEGORY_LABELS[category]}</span><span><Money value={item.spent} decimals={false}/> / <Money value={item.plan} decimals={false}/></span></div>
          <div className="home-track" aria-hidden="true"><i style={{width: Math.min(100, item.plan > 0 ? 100 * item.spent / item.plan : 100) + '%', background: item.spent > item.plan ? 'var(--color-warn)' : category === 'other' ? 'var(--color-muted)' : CATEGORY_COLORS[category]}} /></div>
        </div>)}
        <span className="home-caption">Ausgegeben / geplant in CHF</span>
      </div>}
      {actual.unassigned > 0 && <p className="home-caption">{formatChfShort(actual.unassigned)} ohne Budgetposten</p>}
    </> : <p className="home-empty">Hier erscheinen deine Ausgaben mit dem ersten CSV-Import.<span>Buchungen importieren ›</span></p>}
  </SectionLink>;
}

export function Dashboard() {
  const { model, data, modelFor } = useStore();
  const { summary, salary, plan } = model;
  const [chart, setChart] = usePref<ChartId>('overview.chart', 'category', CHARTS);
  const today = todayYm();
  const currentYear = Number(today.slice(0,4));
  const year = plan.year;
  const start = year === currentYear ? today : year + '-01';
  const yearTransactions = (data.transactions ?? []).filter(t => !t.excludedFromSpend && t.date.startsWith(year + '-'));
  const latest = yearTransactions.reduce((last, t) => t.date > last ? t.date : last, '');
  const observed = latest.slice(0,7) || start;
  const transactions = yearTransactions.filter(t => t.date.startsWith(observed));
  const spesen = plan.salary.expenseAllowance?.monthly ?? 0;
  const net = salary.regularNet - spesen;
  const free = net - summary.expensesMonthly;
  const annualFree = summary.surplusYearly - salary.totals.expenses;
  const savingsItems = model.budget.filter(item => item.category === 'savings');
  const savingsTaxReserve = yearlyByTaxTag(savingsItems, 'taxProvision');
  const wealthBuilding = summary.savingsYearly - savingsTaxReserve;
  const bills = upcomingBills(y => {
    const m = modelFor(y);
    return m ? { year: y, items: m.budget, salaryMonths: m.salary.months, allocations: m.plan.extrasAllocation } : null;
  }, start, 13 - Number(start.slice(5, 7)), 1).sort((a,b) => a.ym.localeCompare(b.ym) || b.amount - a.amount).slice(0,3);
  const contractCount = plannedContracts(model.budget, yearTransactions, year).length;
  const portfolio = summarizePortfolio(data.investments);
  const years = Object.keys(data.years).length;
  return <div className="home-overview">
    <header className="home-heading"><p>{year === currentYear ? new Intl.DateTimeFormat('de-CH', {weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(new Date()) : 'Finanzplan ' + year}</p><h1>Übersicht</h1><YearPicker/></header>
    <section className="home-hero">
      <a className="home-hero-main" href="#budget">
        <div className="home-panel-title"><h2>Monatlich frei laut Plan</h2><FrankIcon name="forward" size={15}/></div>
        <div className={cx('home-balance num', free < 0 && 'home-negative')}><small>CHF</small> <Money value={free}/></div>
        <div className="home-track" aria-hidden="true"><i style={{width: Math.min(100, Math.max(0, net > 0 ? summary.expensesMonthly / net * 100 : 0)) + '%'}} /></div>
        <p className="home-caption">CHF <Money value={net}/> Nettolohn − <Money value={summary.expensesMonthly}/> Budget</p>
      </a>
      <div className="home-hero-foot">
        <a href="#budget"><span>Planrest im Jahr</span><strong className={annualFree < 0 ? 'home-negative' : ''}>CHF <Money value={annualFree} decimals={false}/></strong></a>
        <a href="#tax"><span>Steuerrücklage / Mt.</span><strong>CHF <Money value={model.taxProvisionBudgeted} decimals={false}/></strong></a>
      </div>
      <details className="home-explanation">
        <summary>So rechnet Frank <FrankIcon name="down" size={15}/></summary>
        <dl>
          <div><dt>Planrest pro regulärem Monat</dt><dd>CHF <Money value={net}/> Nettolohn ohne Spesen − <Money value={summary.expensesMonthly}/> Monatsbudget = <b>CHF <Money value={free}/></b></dd></div>
          <div><dt>Planrest im Jahr {year}</dt><dd>CHF <Money value={salary.totals.net}/> Lohnauszahlung{' '}
            {salary.totals.expenses !== 0 && <>− <Money value={salary.totals.expenses}/> Spesen </>}
            {model.otherIncomeYearly !== 0 && <>+ <Money value={model.otherIncomeYearly}/> Nebeneinkünfte </>}
            − <Money value={summary.expensesYearly}/> Jahresbudget = <b>CHF <Money value={annualFree}/></b></dd></div>
          <div><dt>Geplanter Vermögensaufbau im Jahr</dt><dd>CHF <Money value={summary.savingsYearly}/> Sparen &amp; Vorsorge − <Money value={savingsTaxReserve}/> Steuerrückstellung in dieser Kategorie = <b>CHF <Money value={wealthBuilding}/></b></dd></div>
        </dl>
      </details>
    </section>
    <a className="home-panel home-income home-link" href="#salary">
      <div className="home-panel-title"><h2>Einnahmen</h2><span className="home-edit">Lohn &amp; Spesen bearbeiten ›</span></div>
      <dl>{[['Nettolohn', net], ['+ Spesen', spesen], ['Auszahlung', salary.regularNet]].map(([name,value]) => <div key={name}><dt>{name}</dt><dd><Money value={Number(value)}/></dd></div>)}</dl>
      <p className="home-caption">CHF pro regulärem Monat</p>
    </a>
    <div className="home-pair">
      <RadarCard compact/>
      <SpendingPreview budget={model.budget} transactions={transactions} ym={observed}/>
    </div>
    <div className="home-shortcuts">
      <SectionLink href="#tax" label="Steuervorschau">
        <p className="home-tile-value">{model.taxParams ? formatChfShort(model.tax.total) : 'Wohnort wählen'}</p>
        <p className="home-caption">{model.taxParams ? 'Geschätzte Jahressteuer' : 'Steuerdaten einrichten'}</p>
      </SectionLink>
      <SectionLink href="#contracts" label="Verträge">
        <p className="home-tile-value">{contractCount}</p>
        <p className="home-caption">{contractCount === 1 ? 'Vertrag im Budget' : 'Verträge im Budget'}</p>
      </SectionLink>
    </div>
    <section className="home-panel">
      <div className="home-panel-title"><h2>{year < currentYear ? 'Fälligkeiten laut Plan' : 'Als Nächstes laut Plan'}</h2><a href="#budget">Budget ›</a></div>
      {bills.length ? <ul className="home-bills">{bills.map((bill,i) => <li key={bill.ym + i}><span><small>{monthLabel(bill.ym, true)}</small>{bill.name}</span><b>CHF <Money value={bill.amount}/></b></li>)}</ul> : <p className="home-caption">Im erfassten Zeitraum sind keine zusätzlichen Jahres- oder Quartalsrechnungen geplant.</p>}
    </section>
    <Card title="Grafik zum Jahresplan" action={<Select value={chart} onChange={setChart} ariaLabel="Grafik wählen" options={CHARTS.map(c => ({value:c,label:CHART_LABELS[c]}))}/>}>
      {chart === 'category' && <CategoryDonut categories={summary.categories} items={model.budget}/>}
      {chart === 'month' && <MonthlyOutflowChart items={model.budget}/>}
      {chart === 'salary' && <SalaryBars/>}
    </Card>
    {year === currentYear && portfolio.positions.length > 0 && <SectionLink href="#invest" label="Anlagen">
      <p className="home-tile-value">{formatChfShort(portfolio.totalChf)}</p>
      <p className="home-caption">Depotwert · Heute <Money value={portfolio.dayChangeChf} signed/></p>
    </SectionLink>}
    {years > 1 && <Collapsible summary={'Jahresvergleich · ' + years + ' Jahre'}><ComparePage embedded/></Collapsible>}
    <Warnings items={model.warnings}/>
    <BackupReminder/>
    <Pillar3aReminder/>
  </div>;
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
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent/80" />Reguläre Auszahlung</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-info" />13. Lohn / Bonus</span>
      </div>
    </div>
  );
}
