import { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { FrankIcon } from '../components/FrankIcon';
import { CONTRACT_KINDS, acceptContractSuggestion, plannedContracts, recurringSuggestions, type ContractKind, type RecurringSuggestion } from '../domain/contracts';
import { frequencyLabel, itemAmount, yearlyAmount } from '../domain/budgetEngine';
import { formatChf } from '../domain/money';
import { merchantText } from '../domain/merchants';
import { accountDisplayName, bankLabel } from '../domain/importAccounts';
import { MONTH_NAMES } from '../domain/types';
import { PageHeader, Select, TextInput } from './shared';
import './planning.css';

const groupIcons = { Wohnen: 'home', Versicherungen: 'shield', Kredite: 'budget', Abos: 'repeat' } as const;
const groupColors = { Wohnen: '#8ebcff', Versicherungen: '#beb2f7', Kredite: '#f4c37c', Abos: '#84d6a5' };
const monthLabel = (date: string) => MONTH_NAMES[Number(date.slice(5, 7)) - 1] + ' ' + date.slice(0, 4);

function Suggestion({ entry, dismiss }: {entry: RecurringSuggestion; dismiss: () => void}) {
  const { data, plan, update } = useStore();
  const available = plan.budget.filter(b => b.category !== 'savings' && b.name.trim() && plan.budget.filter(i => i.name === b.name).length === 1);
  const same = available.find(b => merchantText(b.name) === merchantText(entry.name));
  const [target, setTarget] = useState(same?.id ?? 'new');
  const [name, setName] = useState(entry.name.slice(0, 80));
  const [review, setReview] = useState(false);
  const account = data.importAccounts?.find(a => a.id === entry.accountId);
  const nameExists = plan.budget.some(item => merchantText(item.name) === merchantText(name));
  const valid = target === 'new' ? name.trim() && !nameExists : available.some(i => i.id === target);
  return <article className="fr-contract-suggestion">
    <div className="fr-contract-pair"><b>{entry.name}</b><b className="num">CHF {formatChf(entry.amount)}</b></div>
    <p>{entry.count} gleiche monatliche Belastungen · {monthLabel(entry.first)} – {monthLabel(entry.last)}</p>
    {account && <small>{bankLabel(account.bankId)} · {accountDisplayName(account)}</small>}
    {review ? <div className="fr-contract-review">
      <label>Budgetposten <Select ariaLabel="Budgetposten für die Zahlungen" value={target} onChange={setTarget} options={[
        { value: 'new', label: 'Neuen Fixkostenposten anlegen' }, ...available.map(b => ({value: b.id, label: b.name})),
      ]} /></label>
      {target === 'new' && <label>Bezeichnung <TextInput ariaLabel="Bezeichnung für den neuen Budgetposten" value={name} onChange={setName} /></label>}
      {target === 'new' && nameExists && <p role="status">Diesen Namen gibt es bereits. Wähle den bestehenden Posten oder passe den Namen an.</p>}
      <p>{target === 'new' ? 'Monatlich CHF ' + formatChf(entry.amount) + ' für das ganze Budgetjahr ' + plan.year + '. ' : ''}{entry.bookingIds.length} {entry.bookingIds.length === 1 ? 'Buchung wird' : 'Buchungen werden'} zugeordnet.</p>
      <div className="fr-contract-actions">
        <button className="fr-contract-primary" disabled={!valid} onClick={() => update(draft => { acceptContractSuggestion(draft, plan.year, entry, target, name); })}>Übernehmen</button>
        <button onClick={() => setReview(false)}>Abbrechen</button>
      </div>
    </div> : <div className="fr-contract-actions">
      <button className="fr-contract-primary" onClick={() => setReview(true)}>Prüfen & zuordnen</button>
      <button onClick={dismiss}>Ausblenden</button>
    </div>}
  </article>;
}

const HIDDEN_KEY = 'frank.contracts.hidden';
function readHidden(): string[] {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(HIDDEN_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

export function ContractsPage() {
  const { data, model } = useStore();
  const year = model.plan.year;
  const [filter, setFilter] = useState<ContractKind | 'Alle'>('Alle');
  const [hidden, setHidden] = useState(readHidden);
  const contracts = useMemo(() => plannedContracts(model.budget, data.transactions ?? [], year), [model.budget, data.transactions, year]);
  const suggestions = useMemo(() => recurringSuggestions(data, year), [data, year]);
  const total = contracts.reduce((sum, row) => sum + yearlyAmount(row.item), 0);
  const visible = contracts.filter(row => filter === 'Alle' || row.group === filter);
  const byKind = (kind: ContractKind) => contracts.filter(row => row.group === kind).reduce((sum,row) => sum + yearlyAmount(row.item), 0);
  const changeHidden = (ids: string[]) => {
    setHidden(ids);
    try { sessionStorage.setItem(HIDDEN_KEY, JSON.stringify(ids)); } catch { /* Session remains usable without storage. */ }
  };
  const available = suggestions.filter(row => !hidden.includes(row.id));
  const hiddenCount = suggestions.length - available.length;
  return <div className="fr-planning">
    <PageHeader title="Verträge" />
    <div className="fr-contract-grid">
      <section className="fr-contract-hero">
          <p className="fr-metric-label">Vertragsposten im Budget · {year}</p>
          <div className="fr-metric"><small>CHF</small> {formatChf(Math.round(total / 12), { decimals: false })}</div>
          <p className="fr-metric-sub">Im Monatsdurchschnitt · {contracts.length} Budgetposten</p>
          {total > 0 && <div className="fr-contract-stack" aria-hidden="true">{CONTRACT_KINDS.map(kind => <i key={kind} style={{flex: byKind(kind), background: groupColors[kind]}} />)}</div>}
          <div className="fr-contract-pair"><span>Im Jahr geplant</span><b className="num">CHF {formatChf(total, { decimals: false })}</b></div>
      </section>
      <section className="fr-contract-planned">
        <div className="fr-contract-toolbar"><h2 className="fr-planning-section">Geplante Verträge</h2>
          <Select ariaLabel="Vertragsart" value={filter} options={(['Alle', ...CONTRACT_KINDS] as const).map(kind => ({ value: kind, label: kind }))} onChange={setFilter} />
        </div>
        <div className="fr-menu">
          {visible.map(({item,group,latest,paid,expected}) => <details className="fr-contract-item" key={item.id}>
            <summary>
              <span className="fr-menu-icon" style={{color:groupColors[group]}}><FrankIcon name={groupIcons[group]} size={18} /></span>
              <span className="fr-menu-copy"><strong>{item.name}</strong><small>{group} · {frequencyLabel(item.frequency)}</small></span>
              <b className="num">{formatChf(itemAmount(item))}</b><span className="fr-menu-arrow"><FrankIcon name="down" size={14} /></span>
            </summary>
            <div className="fr-contract-details">
              <div className="fr-contract-pair"><span>Budget im Jahr</span><b>CHF {formatChf(yearlyAmount(item))}</b></div>
              {latest ? <>
                <div className="fr-contract-pair"><span>Zugeordnet · {monthLabel(latest)}</span><b>CHF {formatChf(paid)}</b></div>
                <p>{paid === expected ? 'Entspricht dem geplanten Betrag in diesem Monat.' : 'In diesem Monat sind laut Plan CHF ' + formatChf(expected) + ' fällig.'}</p>
              </> : <p>Für {year} sind diesem Posten bisher keine Buchungen zugeordnet.</p>}
              <a className="fr-contract-link" href="#budget">Budget öffnen <FrankIcon name="forward" size={13} /></a>
            </div>
          </details>)}
          {!visible.length && <p className="fr-contract-empty">Für diese Auswahl sind keine Vertragsposten im Budget erkennbar. <a href="#budget">Zum Budget</a></p>}
        </div>
      </section>
      <section className="fr-contract-suggest">
        <h2 className="fr-planning-section">Vielleicht ein Vertrag?</h2>
        <div className="fr-menu">
          {available.map(entry => <Suggestion key={entry.id} entry={entry} dismiss={() => changeHidden([...hidden, entry.id])} />)}
          {!available.length && <p className="fr-contract-empty">{hiddenCount ? 'Alle aktuellen Vorschläge sind ausgeblendet.' : 'Sobald drei gleich hohe monatliche Belastungen zu einem möglichen Vertrag passen, erscheint hier ein Vorschlag.'}</p>}
          {hiddenCount > 0 && <button className="fr-contract-restore" onClick={() => changeHidden(hidden.filter(id => !suggestions.some(s => s.id === id)))}>Ausgeblendete wieder zeigen ({hiddenCount})</button>}
        </div>
      </section>
    </div>
  </div>;
}
