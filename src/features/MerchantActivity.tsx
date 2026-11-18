import { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { merchantDirectory, merchantRanking, merchantText, type Merchant } from '../domain/merchants';
import type { AppData, ImportAccount, Transaction } from '../domain/types';
import { bankLabel } from '../domain/importAccounts';
import { BankMark } from './AccountTargetSelect';
import { Button, Money, Select } from './shared';

function MerchantMark({ brand, label }: { brand?: Merchant; label: string }) {
  const src = brand?.logo;
  const initials = (brand?.name || label).split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toLocaleUpperCase();
  return <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-panel-2 text-xs font-bold text-muted">
    {src ? <img alt="" width="36" height="36" className="size-full bg-white object-contain" src={src.startsWith('data:') ? src : import.meta.env.BASE_URL + src} /> : initials || '·'}
  </span>;
}

async function readLogo(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10_000_000) throw new Error('Wähle eine PNG-, JPEG- oder WebP-Datei bis 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

type CustomBrand = NonNullable<AppData['customMerchants']>[number];
function BrandAssignment({ transaction, current, directory, done }: { transaction: Transaction; current?: Merchant; directory: ReturnType<typeof merchantDirectory>; done: () => void }) {
  const { update } = useStore();
  const [choice, setChoice] = useState(current?.id ?? '');
  const [name, setName] = useState('');
  const [imageFile, setImageFile] = useState<File>();
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let brandId = choice;
      let custom: CustomBrand | undefined;
      if (choice === 'new') {
        const display = name.trim();
        if (!display) throw new Error('Gib einen Firmennamen ein.');
        const same = directory.all.find(b => merchantText(b.name) === merchantText(display));
        brandId = same?.id ?? 'local-' + crypto.randomUUID();
        if (!same || same.id.startsWith('local-') || imageFile) {
          custom = { id: brandId, name: same?.name ?? display, logo: imageFile ? await readLogo(imageFile) : same?.logo };
        }
      }
      update(draft => {
        const tx = draft.transactions?.find(t => t.id === transaction.id);
        if (!tx) return;
        if (custom) draft.customMerchants = [...(draft.customMerchants ?? []).filter(m => m.id !== custom.id), custom];
        if (remember && merchantText(tx.text)) {
          const key = merchantText(tx.text);
          draft.merchantRules = [...(draft.merchantRules ?? []).filter(r => r.match !== key), { match: key, merchantId: brandId }];
          delete tx.merchantId;
        } else tx.merchantId = brandId;
      });
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das Logo konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="my-2 space-y-2 rounded-xl bg-panel-2 p-3">
    <p className="break-words text-xs text-muted">{transaction.text}</p>
    <Select ariaLabel="Marke zuordnen" className="w-full" value={choice} onChange={setChoice} options={[
      { value: '', label: 'Ohne Marke' }, { value: 'new', label: '+ Marke oder eigenes Logo hinzufügen' },
      ...directory.all.slice().sort((a,b) => a.name.localeCompare(b.name)).map(b => ({ value: b.id, label: b.name })),
    ]} />
    {choice === 'new' && <div className="space-y-2">
      <label className="block text-xs">Firmenname<input className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm" maxLength={70} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-xs">Eigenes Logo (optional)<input className="mt-1 block w-full" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setImageFile(e.target.files?.[0])} /></label>
    </div>}
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!merchantText(transaction.text)} checked={remember} onChange={e => setRemember(e.target.checked)} />Für denselben Buchungstext merken</label>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    <div className="flex gap-2"><Button onClick={done}>Schliessen</Button><button type="button" disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm text-bg" onClick={() => void save()}>Übernehmen</button></div>
  </div>;
}

export function MerchantActivity({ transactions, accounts }: { transactions: Transaction[]; accounts: ImportAccount[] }) {
  const { data } = useStore();
  const directory = useMemo(() => merchantDirectory(data), [data.customMerchants, data.merchantRules]);
  const [period, setPeriod] = useState('');
  const [sort, setSort] = useState<'amount' | 'count'>('amount');
  const [filter, setFilter] = useState('');
  const [editId, setEditId] = useState('');
  const [limit, setLimit] = useState(20);
  const years = [...new Set(transactions.map(t => t.date.slice(0,4)))].sort().reverse();
  const preferred = years.includes(String(data.activeYear)) ? String(data.activeYear) : years[0];
  const year = period === 'all' || years.includes(period) ? period : preferred;
  const matched = useMemo(() => transactions.filter(t => year === 'all' || t.date.startsWith(year ?? '')).map(transaction => ({ transaction, merchant: directory.find(transaction) })), [transactions, year, directory]);
  const ranking = merchantRanking(matched, sort);
  const list = matched.filter(({merchant}) => filter === '' || (filter === 'unmatched' ? !merchant : merchant?.id === filter)).sort((a,b) => b.transaction.date.localeCompare(a.transaction.date));
  const brands = Array.from(new Map(matched.flatMap(({merchant}) => merchant ? [[merchant.id,merchant] as const] : [])).values()).sort((a,b) => a.name.localeCompare(b.name));
  if (!transactions.length) return null;
  return <section className="mt-5 space-y-3 border-t border-line pt-4" aria-label="Marken und Buchungen">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Top-Marken</h3>
      <div className="flex flex-wrap gap-2"><Select ariaLabel="Marken-Zeitraum" value={year ?? 'all'} onChange={v => {setPeriod(v);setFilter('');setLimit(20);}} options={[...years.map(y => ({value:y,label:y})),{value:'all',label:'Alle Jahre'}]}/>
      <Select ariaLabel="Top-Marken sortieren" value={sort} onChange={setSort} options={[{ value: 'amount', label: 'Nach Ausgaben' },{ value: 'count', label: 'Nach Häufigkeit' }]} /></div></div>
    <ol className="divide-y divide-line">{ranking.slice(0,5).map(({merchant,count,amount},i) => <li key={merchant.id}><button className="flex min-h-12 w-full items-center gap-2 text-left text-sm" onClick={() => {setFilter(merchant.id);setEditId('');setLimit(20);}}>
      <span className="w-3 text-xs text-muted">{i+1}</span><MerchantMark brand={merchant} label={merchant.name} /><span className="min-w-0 flex-1 truncate">{merchant.name}<small className="block text-muted">{count} {count === 1 ? 'Buchung' : 'Buchungen'}</small></span><Money value={amount} />
    </button></li>)}</ol>
    {!ranking.length && <p className="text-sm text-muted">In dieser Auswahl sind noch keine Ausgaben einer Marke zugeordnet.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Buchungen ({list.length})</h4><Select ariaLabel="Buchungen nach Marke" className="max-w-full" value={filter} onChange={v => {setFilter(v);setLimit(20);setEditId('');}} options={[{value:'',label:'Alle Firmen'},{value:'unmatched',label:'Ohne Zuordnung'},...brands.map(b => ({value:b.id,label:b.name}))]}/></div>
    <ul className="divide-y divide-line">{list.slice(0,limit).map(({transaction:t,merchant}) => {
      const account=accounts.find(a => a.id===t.accountId);
      return <li key={t.id}><button className="flex min-h-12 w-full items-center gap-2 text-left" onClick={() => setEditId(editId===t.id?'':t.id)} aria-expanded={editId===t.id}>
        <MerchantMark brand={merchant} label={t.text}/><span className="min-w-0 flex-1"><b className="block truncate text-sm">{merchant?.name || t.text || 'Ohne Buchungstext'}</b>
        <small className="flex items-center gap-1 text-xs text-muted">{t.date.split('-').reverse().join('.')}{account && <><BankMark bankId={account.bankId} size={14}/><span className="truncate">{bankLabel(account.bankId)} · {account.name}</span></>}</small></span><span className="shrink-0 text-sm"><Money value={t.amount} signed/></span></button>
        {editId===t.id && <BrandAssignment transaction={t} current={merchant} directory={directory} done={() => setEditId('')}/>}
      </li>;
    })}</ul>
    {list.length>limit && <Button onClick={() => setLimit(limit+30)}>Weitere Buchungen</Button>}
  </section>;
}
