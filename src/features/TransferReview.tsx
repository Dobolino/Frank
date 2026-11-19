import { useId, useMemo, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { confirmedTransfers, confirmTransfer, transferSuggestions, unlinkTransfer, type TransferPair } from '../domain/accountTransfers';
import { accountDisplayName, bankLabel } from '../domain/importAccounts';
import { formatChf } from '../domain/money';
import type { ImportAccount, Transaction } from '../domain/types';
import { BankMark } from './AccountTargetSelect';

const pageSize = 4;
const dateFormat = new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function BookingLeg({ row, account, hidden }: { row: Transaction; account?: ImportAccount; hidden: boolean }) {
  const incoming = row.amount > 0;
  const counterparty = row.counterparty?.trim();
  return <div className="flex min-w-0 items-start gap-2 rounded-lg bg-panel-2 p-2.5">
    {account && <BankMark bankId={account.bankId} size={26} />}
    <div className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
      <span className="block text-xs text-muted">{incoming ? 'Gutschrift' : 'Belastung'}{account && ' · ' + bankLabel(account.bankId)}</span>
      <strong className="font-semibold">{account ? accountDisplayName(account) : 'Konto ohne Zuordnung'}</strong>
      {!hidden && <p className="mt-0.5 text-xs text-muted">{row.text}</p>}
      {!hidden && counterparty && !row.text.toLocaleLowerCase().includes(counterparty.toLocaleLowerCase()) &&
        <p className="text-xs text-muted">{incoming ? 'Von ' : 'An '}{counterparty}</p>}
    </div>
    <span className="shrink-0 text-sm font-semibold tabular-nums">
      {hidden ? <><span aria-hidden="true">••••</span><span className="sr-only">Betrag ausgeblendet</span></>
        : (incoming ? '+' : '−') + formatChf(Math.abs(row.amount), { prefix: true })}
    </span>
  </div>;
}

function TransferList({ pairs, accounts, hidden, confirmed = false, change }: {
  pairs: TransferPair[]; accounts: Map<string, ImportAccount>; hidden: boolean; confirmed?: boolean;
  change: (pair: TransferPair, confirmed: boolean, keyboard: boolean, index: number) => void;
}) {
  const [limit, setLimit] = useState(pageSize);
  const id = useId();
  return <>
    <ul aria-label={confirmed ? 'Bestätigte Umbuchungen' : 'Vorgeschlagene Umbuchungen'}>
      {pairs.slice(0, limit).map((pair, index) => {
        const descriptionId = id + '-pair-' + index;
        const date = pair.outgoing.date;
        return <li key={pair.outgoing.id + '/' + pair.incoming.id} className="border-t border-line py-3">
          <div id={descriptionId}>
            <time dateTime={date} className="mb-2 block text-xs font-medium text-muted">{dateFormat.format(new Date(date + 'T12:00:00Z'))}</time>
            <div className="grid gap-1.5 md:grid-cols-2">
              <BookingLeg row={pair.outgoing} account={accounts.get(pair.outgoing.accountId ?? '')} hidden={hidden} />
              <BookingLeg row={pair.incoming} account={accounts.get(pair.incoming.accountId ?? '')} hidden={hidden} />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" aria-describedby={descriptionId} data-transfer-action={confirmed ? 'unlink' : 'confirm'}
              className={confirmed ? 'min-h-11 rounded-lg border border-line px-3 text-sm hover:bg-panel-2'
                : 'min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-bg hover:bg-accent/90'}
              onClick={event => change(pair, confirmed, event.detail === 0, index)}>
              {confirmed ? 'Verknüpfung lösen' : 'Als Umbuchung bestätigen'}
            </button>
          </div>
        </li>;
      })}
    </ul>
    {pairs.length > limit && <button type="button" className="mb-2 min-h-11 w-full rounded-lg border border-line text-sm hover:bg-panel-2"
      onClick={() => setLimit(limit + pageSize)}>Weitere {confirmed ? 'Umbuchungen' : 'Vorschläge'} anzeigen</button>}
  </>;
}

export function TransferReview({ hiddenAmounts }: { hiddenAmounts: boolean }) {
  const { data, update } = useStore();
  const suggested = useMemo(() => transferSuggestions(data), [data]);
  const confirmed = useMemo(() => confirmedTransfers(data), [data]);
  const accounts = useMemo(() => new Map(data.importAccounts?.map(a => [a.id, a])), [data.importAccounts]);
  const panel = useRef<HTMLDetailsElement>(null);
  const [notice, setNotice] = useState('');

  function change(pair: TransferPair, wasConfirmed: boolean, keyboard: boolean, index: number) {
    update(draft => {
      const apply = wasConfirmed ? unlinkTransfer : confirmTransfer;
      const done = apply(draft, pair.outgoing.id, pair.incoming.id);
      setNotice(done ? (wasConfirmed ? 'Verknüpfung gelöst.' : 'Umbuchung bestätigt.') : 'Die Buchungen haben sich geändert. Prüfe die aktuelle Liste.');
    });
    if (keyboard) requestAnimationFrame(() => {
      const action = wasConfirmed ? 'unlink' : 'confirm';
      const remaining = panel.current?.querySelectorAll<HTMLButtonElement>(`[data-transfer-action="${action}"]`);
      const next = remaining?.[Math.min(index, remaining.length - 1)] ?? panel.current?.querySelector('summary');
      next?.focus();
    });
  }

  if (!suggested.length && !confirmed.length && !notice) return null;
  return <details ref={panel} className="group ex-card mb-3 px-4">
    <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-2">
      <span><strong className="block font-semibold tracking-tight">Umbuchungen</strong>
        <span className={suggested.length ? 'block text-xs text-accent' : 'block text-xs text-muted'}>
          {suggested.length ? suggested.length + (suggested.length === 1 ? ' Vorschlag prüfen' : ' Vorschläge prüfen') : confirmed.length + ' bestätigt'}
        </span>
      </span>
      <span aria-hidden="true" className="text-muted group-open:rotate-180">⌄</span>
    </summary>
    <div className="pb-2">
      {suggested.length > 0 && <>
        <p className="mb-3 text-sm text-muted">Gehören die beiden Buchungen zu derselben Überweisung? Nach deiner Bestätigung zählt der Betrag weder als Einnahme noch als Ausgabe.</p>
        <TransferList pairs={suggested} accounts={accounts} hidden={hiddenAmounts} change={change} />
      </>}
      {confirmed.length > 0 && <details className="border-t border-line">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium">
          Bestätigte Umbuchungen ({confirmed.length})<span aria-hidden="true" className="text-muted">⌄</span>
        </summary>
        <TransferList pairs={confirmed} accounts={accounts} hidden={hiddenAmounts} confirmed change={change} />
      </details>}
      <p role="status" className="text-sm text-accent">{notice}</p>
    </div>
  </details>;
}
