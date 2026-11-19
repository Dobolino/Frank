import { useState } from 'react';
import { useStore } from '../app/store';
import { outflowsByMonth } from '../domain/budgetEngine';
import { DEFAULT_RADAR_BUFFER, radarAccount } from '../domain/radarEngine';
import { MONTH_NAMES } from '../domain/types';
import { CashflowPage } from './CashflowPage';
import { GoalsPage } from './GoalsPage';
import { RadarCard } from './RadarCard';
import { BalanceCurve, SavingsAreaHeader } from './SavingsArea';
import { BankMark } from './AccountTargetSelect';
import { bankLabel } from '../domain/importAccounts';
import { Card, Money, Select } from './shared';

function SavingsProjection() {
  const { data, model } = useStore();
  const year = model.plan.year;
  const accounts = model.cashflow.filter(c => c.account.type === 'savings');
  const radar = data.settings?.radar;
  const selectedRadarAccount = radarAccount(data.accounts, model.budget, radar?.accountId);
  const [selection, setSelection] = useState(selectedRadarAccount ? 'account:' + selectedRadarAccount.id : 'pillar3a');
  const [span, setSpan] = useState<6 | 12>(12);
  const [index, setIndex] = useState(() => {
    const now = new Date();
    return year === now.getFullYear() ? now.getMonth() : year < now.getFullYear() ? 11 : 0;
  });
  const pension = selection === 'pillar3a' || accounts.length === 0;
  const account = pension ? undefined : accounts.find(c => 'account:' + c.account.id === selection) ?? accounts[0];
  const option = account ? 'account:' + account.account.id : 'pillar3a';
  const contributions = Array<number>(12).fill(0);
  for (const item of model.budget.filter(b => b.taxTag === 'pillar3a')) {
    outflowsByMonth(item).forEach((value,i) => { contributions[i] = contributions[i]! + value; });
  }
  let accrued = 0;
  const balances = account ? account.months.map(m => m.balanceEnd) : contributions.map(v => (accrued += v));
  const start = span === 12 || index < 6 ? 0 : 6;
  const display = balances.slice(start, start + span).map((value,i) => ({value, time: start+i, label: MONTH_NAMES[start+i]!}));
  const buffer = account && selectedRadarAccount?.id === account.account.id ? radar?.buffer ?? DEFAULT_RADAR_BUFFER : undefined;
  const balance = balances[index]!, month = account?.months[index];
  return (
    <section className="sa-surface" aria-label="Sparplanung">
      <div className="sa-filters">
        <Select ariaLabel="Sparkonto oder Säule 3a wählen" value={option} onChange={setSelection} options={[...accounts.map(c => ({value: 'account:' + c.account.id, label: c.account.name})),{value: 'pillar3a', label: 'Säule 3a · Einzahlungen'}]}/>
        <div className="sa-period" role="group" aria-label="Zeitraum der Spargrafik">
          {([6,12] as const).map(n => <button type="button" key={n} aria-pressed={span===n} onClick={() => setSpan(n)}>{n === 12 ? '1J' : '6M'}</button>)}
        </div>
      </div>
      <p className="sa-kicker">{account ? 'Geplanter Kontostand' : 'Geplante 3a-Einzahlungen'} bis Ende {MONTH_NAMES[index]} {year}</p>
      <div className="sa-summary"><strong className="num"><Money value={balance}/></strong><small>CHF</small></div>
      <BalanceCurve title={account ? 'Kontoverlauf laut Jahresplan' : 'Kumulierte Einzahlungen in die Säule 3a'} points={display} selected={index-start} buffer={buffer}/>
      <label className="sa-caption" htmlFor="savings-month">Monat im Jahresplan</label>
      <input id="savings-month" className="sa-range" type="range" min="0" max="11" value={index} aria-valuetext={MONTH_NAMES[index]} onChange={e=>setIndex(Number(e.target.value))}/>
      {buffer !== undefined && <p className={balance < buffer ? 'text-xs text-warn' : 'sa-caption'}>
        {balance < buffer ? <><Money value={buffer-balance}/> CHF unter Puffer</> : <>Puffer · CHF <Money value={buffer}/></>}
      </p>}
      <dl className="sa-fields">
        <div><dt>{month ? 'Eingänge im Monat' : 'Einzahlung im Monat'}</dt><dd><Money value={month ? month.inflowStandingOrder + month.inflowExtras : contributions[index]!}/> CHF</dd></div>
        <div><dt>{month ? 'Abflüsse im Monat' : 'Einzahlung im Jahr'}</dt><dd><Money value={month ? month.outflow : balances[11]!}/> CHF</dd></div>
      </dl>
    </section>
  );
}

function SavingsBookings() {
  const { data, model } = useStore();
  const names = new Set(model.budget.filter(item => item.category === 'savings' && item.taxTag !== 'taxProvision').map(item => item.name));
  // Bei namensgleichen Posten aus verschiedenen Gruppen ist die Zuordnung mehrdeutig.
  for (const item of model.budget) {
    if (item.category !== 'savings' || item.taxTag === 'taxProvision') names.delete(item.name);
  }
  const entries = (data.transactions ?? [])
    .filter(row => row.item && names.has(row.item) && row.date.startsWith(model.plan.year + '-'))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!entries.length) return null;

  const accounts = new Map(data.importAccounts?.map(account => [account.id, account]));
  return (
    <Card title="Sparbuchungen" className="mt-4">
      <p className="mb-2 text-xs text-muted">{entries.length > 5 ? 'Die letzten fünf Bankbuchungen' : 'Importierte Bankbuchungen'} mit Sparposten im Budget {model.plan.year}.</p>
      <ul className="divide-y divide-line">
        {entries.slice(0, 5).map(row => {
          const account = row.accountId ? accounts.get(row.accountId) : undefined;
          return (
            <li key={row.id} className="flex min-w-0 items-center gap-3 py-2">
              {account && <BankMark bankId={account.bankId} />}
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{row.item}</strong>
                <small className="block truncate text-muted">{row.date.split('-').reverse().join('.')}{account && ' · ' + bankLabel(account.bankId) + ' · ' + account.name}</small>
              </div>
              <span className="text-sm"><Money value={row.amount} signed /> CHF</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function SavingsPage() {
  const { data } = useStore();
  return (
    <>
      <SavingsAreaHeader area="savings"/>
      <div className="sa-columns">
        <SavingsProjection key={data.activeYear}/>
        <section className="min-w-0" aria-label="Sparziele"><GoalsPage embedded/></section>
      </div>
      <SavingsBookings />
      <div className="mt-4"><RadarCard/></div>
      <details className="sa-surface sa-disclosure mt-4">
        <summary>Daueraufträge und Monatsplanung</summary>
        <CashflowPage embedded/>
      </details>
    </>
  );
}
