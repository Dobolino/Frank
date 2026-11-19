import { useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import type { ImportAccount } from '../domain/types';
import { accountDisplayName, accountTypeLabel, bankLabel } from '../domain/importAccounts';
import { canMergeImportAccounts, mergeImportAccounts, previewAccountMerge } from '../domain/mergeImportAccounts';
import { BankMark, AccountEditor } from './AccountTargetSelect';
import { Button, Card } from './shared';

const inputClass = 'w-full min-h-11 rounded-lg border border-line bg-bg px-3 py-2 text-sm';

function EditAccount({account, close, saved}: {account: ImportAccount; close: () => void; saved: () => void}) {
  const { update } = useStore();
  const [original] = useState(account);
  const [name, setName] = useState(account.name);
  const [ending, setEnding] = useState(account.lastFour ?? '');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || (ending && !/^[0-9]{4}$/.test(ending))) return;
    update(draft => {
      const row = draft.importAccounts?.find(a => a.id === account.id);
      if (!row || row.name !== original.name || row.lastFour !== original.lastFour) {
        setError('Das Konto wurde inzwischen geändert. Öffne es erneut.');
        return;
      }
      const duplicate = draft.importAccounts?.some(a => a.id !== row.id && a.bankId === row.bankId && a.type === row.type &&
        a.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase() && (a.lastFour ?? '') === ending);
      if (duplicate) {
        setError('Dieses Konto ist unter demselben Namen und denselben Endziffern vorhanden. Wähle einen anderen Namen oder führe die Konten zusammen.');
        return;
      }
      row.name = name.trim();
      if (ending) row.lastFour = ending;
      else delete row.lastFour;
      saved();
    });
  }
  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-panel-2 p-3">
    <label className="block text-sm">Kontoname
      <input autoFocus required className={inputClass} value={name} onChange={e => setName(e.target.value)}/>
    </label>
    <label className="block text-sm">Letzte vier Ziffern (optional)
      <input className={inputClass} type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off"
        value={ending} onChange={e => setEnding(e.target.value)} placeholder="z. B. 0123"/>
    </label>
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={close}>Abbrechen</Button>
      <button type="submit" disabled={!name.trim() || Boolean(ending && !/^[0-9]{4}$/.test(ending))} className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg disabled:opacity-40">Änderungen speichern</button>
    </div>
  </form>;
}

function MergeAccounts({close, saved}: {close: () => void; saved: (name:string) => void}) {
  const { data, update } = useStore();
  const accounts = data.importAccounts ?? [];
  const [targetId, setTarget] = useState('');
  const [sourceIds, setSources] = useState<string[]>([]);
  const [error, setError] = useState('');
  const target = accounts.find(account => account.id === targetId);
  const choices = target ? accounts.filter(account => canMergeImportAccounts(target, account)) : [];
  const title = (a: ImportAccount) => bankLabel(a.bankId) + ' · ' + accountDisplayName(a);
  let preview: ReturnType<typeof previewAccountMerge> | undefined;
  let previewError = '';
  if (sourceIds.length && target) {
    try { preview = previewAccountMerge(data, targetId, sourceIds); }
    catch (e) { previewError = e instanceof Error ? e.message : 'Diese Konten können nicht zusammengeführt werden.'; }
  }

  const count = preview ? preview.moves + preview.trades : 0;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!preview || !target) return;
    update(draft => {
      try {
        const current = previewAccountMerge(draft, targetId, sourceIds);
        if (current.moves !== preview.moves || current.trades !== preview.trades || current.links !== preview.links || current.released.size !== preview.released.size || current.sharedTrades.size !== preview.sharedTrades.size) {
          setError('Die Buchungen haben sich geändert. Prüfe die Vorschau erneut.');
          return;
        }
        mergeImportAccounts(draft, targetId, sourceIds);
        saved(accountDisplayName(target));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Zusammenführen fehlgeschlagen.');
      }
    });
  }

  return <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-line bg-panel-2 p-3 text-sm">
    <h3 className="font-semibold">Konten zusammenführen</h3>
    <label className="block">Welches Konto soll bleiben?
      <select className={inputClass} value={targetId} onChange={e => { setTarget(e.target.value); setSources([]); setError(''); }}>
        <option value="">Zielkonto wählen …</option>
        {accounts.filter(a => accounts.some(b => canMergeImportAccounts(a,b))).map(a => <option key={a.id} value={a.id}>{title(a)}</option>)}
      </select>
    </label>
    {target && <fieldset><legend className="mb-1">Diese Konten hinzufügen</legend>
      {choices.map(a => <label className="flex min-h-11 cursor-pointer items-center gap-2 border-t border-line py-2" key={a.id}>
        <input type="checkbox" checked={sourceIds.includes(a.id)} onChange={e => {
          setSources(e.target.checked ? [...sourceIds, a.id] : sourceIds.filter(id => id !== a.id));
          setError('');
        }}/>
        <BankMark bankId={a.bankId} size={24}/><span>{title(a)}</span>
      </label>)}
    </fieldset>}
    {preview && target && <div aria-live="polite" className="space-y-1 rounded-lg bg-bg p-3">
      <p><strong>{count} {count === 1 ? 'Buchung' : 'Buchungen'}</strong> und {preview.links} gespeicherte {preview.links === 1 ? 'CSV-Zuordnung' : 'CSV-Zuordnungen'} gehen auf «{accountDisplayName(target)}» über.</p>
      {preview.released.size > 0 && <p className="text-warn">Verknüpfte Umbuchungen auf dasselbe Konto werden gelöst ({preview.released.size / 2}). Beide Buchungen bleiben erhalten und zählen wieder gemäss ihrer Importkategorie.</p>}
      {preview.sharedTrades.size > 0 && <p>{preview.sharedTrades.size === 1 ? 'Eine identische Depotbuchung mit derselben Broker-ID zählt danach einmal.' : preview.sharedTrades.size + ' identische Depotbuchungen mit derselben Broker-ID zählen danach je einmal.'}</p>}
      <p className="text-xs text-muted">Name und Endziffern des Zielkontos bleiben erhalten. Die ausgewählten Quellkonten verschwinden aus der Kontenliste.</p>
    </div>}
    {(previewError || error) && <p role="alert" className="text-warn">{previewError || error}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={close}>Abbrechen</Button>
      <button type="submit" disabled={!preview} className="min-h-11 rounded-lg bg-accent px-3 py-2 font-semibold text-bg disabled:opacity-40">Auswahl zusammenführen</button>
    </div>
  </form>;
}

export function AccountsCard({ standalone = false }: { standalone?: boolean }) {
  const { data } = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState('');
  const [merging, setMerging] = useState(false);
  const [notice, setNotice] = useState('');
  const accounts = data.importAccounts ?? [];
  const canMerge = accounts.some(a => accounts.some(b => canMergeImportAccounts(a,b)));
  const idle = !adding && !accounts.some(a => a.id === editing) && !merging;
  return <Card title={standalone ? 'Eigene Konten' : 'Konten & Karten'} className="md:col-span-2"
    action={idle && <Button onClick={() => { setAdding(true); setNotice(''); }}>+ Konto</Button>}>
    {adding && <AccountEditor onCancel={() => setAdding(false)} onCreated={() => setAdding(false)} />}
    {accounts.length ? <ul className="mb-3">
      {accounts.map(a => <li key={a.id} className="border-b border-line py-1">
        <button type="button" aria-label={bankLabel(a.bankId) + ' ' + accountDisplayName(a) + ' bearbeiten'}
          aria-expanded={a.id === editing} disabled={!idle && a.id !== editing} className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
          onClick={() => { setEditing(editing === a.id ? '' : a.id); setNotice(''); }}>
          <BankMark bankId={a.bankId} size={36}/>
          <span className="min-w-0 flex-1"><strong className="block break-words text-sm">{accountDisplayName(a)}</strong>
            <span className="block text-xs text-muted">{bankLabel(a.bankId)} · {accountTypeLabel(a.type)}</span></span>
          <span className="text-xs text-accent">{a.id === editing ? 'Schliessen' : 'Bearbeiten'}</span>
        </button>
        {a.id === editing && <EditAccount account={a} close={() => setEditing('')} saved={() => { setEditing(''); setNotice('Konto gespeichert.'); }}/>}
      </li>)}
    </ul> : <p className="mb-3 text-sm text-muted">Lege ein Bankkonto, eine Kreditkarte oder ein Depot an, um Buchungen zuzuordnen.</p>}
    {idle && canMerge && <Button variant="ghost" onClick={() => { setMerging(true); setNotice(''); }}>Konten zusammenführen</Button>}
    {merging && <MergeAccounts close={() => setMerging(false)} saved={name => {
      setMerging(false); setNotice('Konten in «' + name + '» zusammengeführt.');
    }}/>}
    {notice && <p role="status" className="my-2 text-sm text-accent">{notice}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <a className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm hover:bg-line" href="#expenses">Konto- oder Karten-CSV importieren</a>
      <a className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm hover:bg-line" href="#invest">Depot-CSV importieren</a>
    </div>
  </Card>;
}
