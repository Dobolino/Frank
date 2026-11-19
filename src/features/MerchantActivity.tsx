import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
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

interface ActivityProps {
  transactions: Transaction[];
  accounts: ImportAccount[];
  hidden: boolean;
  hourly: number;
  budgetNames: string[];
  assign: (transaction: Transaction, item: string) => void;
  chart: ReactNode;
}
function workTime(amount: number, hourly: number) {
  const minutes = Math.round((60 * amount) / hourly);
  if (minutes < 60) return minutes + ' min';
  return Math.floor(minutes / 60) + ' h' + (minutes % 60 ? ' ' + (minutes % 60) + ' min' : '');
}

export function MerchantActivity({
  transactions,
  accounts,
  hidden,
  hourly,
  budgetNames,
  assign,
  chart,
}: ActivityProps) {
  const { data } = useStore();
  const directory = useMemo(() => merchantDirectory(data), [data.customMerchants, data.merchantRules]);
  const [sort, setSort] = useState<'amount' | 'count'>('amount');
  const [filter, setFilter] = useState('');
  const [editId, setEditId] = useState('');
  const [limit, setLimit] = useState(25);
  const ledgerTitle = useRef<HTMLHeadingElement>(null);
  const matched = useMemo(
    () => transactions.map((transaction) => ({ transaction, merchant: directory.find(transaction) })),
    [transactions, directory],
  );
  const ranking = merchantRanking(matched, sort);
  const list = matched
    .filter(({ merchant, transaction }) => {
      if (filter === 'open') return transaction.amount < 0 && !transaction.item && !transaction.excludedFromSpend;
      if (filter === 'unmatched') return !merchant;
      return !filter || merchant?.id === filter;
    })
    .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
  const brands = Array.from(
    new Map(matched.flatMap(({ merchant }) => (merchant ? [[merchant.id, merchant] as const] : []))).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const changeFilter = (value: string) => {
    setFilter(value);
    setLimit(25);
    setEditId('');
  };
  const dayLabel = (date: string) =>
    new Date(date + 'T12:00:00Z').toLocaleDateString('de-CH', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  return (
    <div className="ex-layout">
      <div className="ex-aside">
        {chart}
        {ranking.length > 0 && (
          <details className="ex-card ex-rank">
            <summary>
              <span>
                <strong>Top-Marken</strong>
                <small>
                  {ranking.length} {ranking.length === 1 ? 'Marke' : 'Marken'} im Zeitraum
                </small>
              </span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <Select
              ariaLabel="Top-Marken sortieren"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'amount', label: 'Nach Ausgaben' },
                { value: 'count', label: 'Nach Häufigkeit' },
              ]}
            />
            <ol>
              {ranking.slice(0, 5).map(({ merchant, count, amount }, i) => (
                <li key={merchant.id}>
                  <button
                    type="button"
                    onClick={() => {
                      changeFilter(merchant.id);
                      ledgerTitle.current?.focus();
                    }}
                  >
                    <small>{i + 1}</small>
                    <MerchantMark brand={merchant} label={merchant.name} />
                    <span className="ex-name">
                      <b>{merchant.name}</b>
                      <small>
                        {count} {count === 1 ? 'Buchung' : 'Buchungen'}
                      </small>
                    </span>
                    <b className="ex-sum">{hidden ? '••••' : <Money value={amount} />}</b>
                  </button>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <section className="ex-card ex-ledger">
        <header className="ex-card-head">
          <div>
            <h2 ref={ledgerTitle} tabIndex={-1}>
              Buchungen
            </h2>
            <small>{list.length} im Zeitraum · CHF</small>
          </div>
          <Select
            ariaLabel="Buchungen nach Marke"
            className="ex-brandselect"
            value={filter}
            onChange={changeFilter}
            options={[
              { value: '', label: 'Alle Händler' },
              { value: 'unmatched', label: 'Ohne Marke' },
              { value: 'open', label: 'Ohne Budgetposten' },
              ...brands.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        </header>
        {list.length === 0 && (
          <p className="ex-empty">
            {filter
              ? 'Keine Buchungen für diese Auswahl.'
              : 'Für diesen Zeitraum sind keine Buchungen erfasst. Über CSV kannst du einen Konto- oder Kartenauszug importieren.'}
          </p>
        )}
        {list.slice(0, limit).map(({ transaction: t, merchant }, i) => {
          const account = accounts.find((a) => a.id === t.accountId);
          const name = merchant?.name || (hidden ? 'Buchung' : t.text) || 'Ohne Buchungstext';
          return (
            <Fragment key={t.id}>
              {list[i - 1]?.transaction.date !== t.date && <h3 className="ex-day">{dayLabel(t.date)}</h3>}
              <button
                className="ex-booking"
                type="button"
                aria-expanded={editId === t.id && !hidden}
                disabled={hidden}
                onClick={() => setEditId(editId === t.id ? '' : t.id)}
              >
                <MerchantMark brand={merchant} label={name} />
                <span className="ex-name">
                  <b>{name}</b>
                  <small>
                    {account && <BankMark bankId={account.bankId} size={12} />}
                    {t.excludedFromSpend
                      ? 'Geldbewegung · ausgeklammert'
                      : t.item || t.category || (t.amount > 0 ? 'Eingang' : 'Ausgabe')}
                  </small>
                </span>
                <span className="ex-book-amount">
                  <b className={t.amount > 0 ? 'text-accent' : ''}>
                    {hidden ? '••••' : <Money value={t.amount} signed />}
                  </b>
                  {!hidden && t.amount < 0 && !t.excludedFromSpend && hourly > 0 && (
                    <small>{workTime(-t.amount, hourly)}</small>
                  )}
                </span>
              </button>
              {editId === t.id && !hidden && (
                <div className="ex-edit">
                  {account && (
                    <p className="ex-caption">
                      {bankLabel(account.bankId)} · {account.name}
                    </p>
                  )}
                  {t.amount < 0 && !t.excludedFromSpend && budgetNames.length > 0 && (
                    <label className="ex-assign">
                      Budgetposten
                      <Select
                        ariaLabel="Budgetposten"
                        value={t.item ?? ''}
                        onChange={(value) => {
                          if (value) assign(t, value);
                        }}
                        options={[
                          { value: '', label: 'Posten wählen …' },
                          ...Array.from(new Set([...(t.item ? [t.item] : []), ...budgetNames])).map((n) => ({
                            value: n,
                            label: n,
                          })),
                        ]}
                      />
                      <small>Frank merkt sich den Händler und die Kategorie für weitere Buchungen.</small>
                    </label>
                  )}
                  <BrandAssignment
                    transaction={t}
                    current={merchant}
                    directory={directory}
                    done={() => setEditId('')}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
        {list.length > limit && (
          <button className="ex-more" type="button" onClick={() => setLimit(limit + 35)}>
            Weitere Buchungen ({list.length - limit})
          </button>
        )}
      </section>
    </div>
  );
}
