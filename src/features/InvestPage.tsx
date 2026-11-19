import { useState, type ReactNode } from 'react';
import { useStore } from '../app/store';
import { SavingsAreaHeader } from './SavingsArea';
import { PortfolioOverview } from './PortfolioOverview';
import { InvestmentImport } from './InvestmentImport';
import { WealthCard } from './WealthCard';
import { Badge, Button, Card, Money, MoneyInput, Row, Select, Warnings, cx } from './shared';
import { formatPercent } from '../domain/money';
import { neededFx, summarizePortfolio, type HoldingValue } from '../domain/investEngine';
import type { Holding, Investments } from '../domain/types';
import {
  PROVIDERS,
  QuoteError,
  fetchFxToChf,
  fetchQuote,
  loadQuoteConfig,
  saveQuoteConfig,
  searchSymbols,
  type QuoteConfig,
  type QuoteProvider,
  type SymbolMatch,
} from '../quotes/quotes';

const CURRENCIES = ['CHF', 'USD', 'EUR', 'GBP', 'GBX', 'JPY', 'CAD', 'SEK', 'NOK', 'DKK', 'AUD', 'HKD'];
/** Twelve Data gratis: 8 Abfragen pro Minute. */
const TWELVE_PER_MINUTE = 8;

const emptyInvestments = (): Investments => ({ holdings: [], fx: {} });
const newId = () => `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtNum = (n: number, digits = 2) => n.toLocaleString('de-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/’/g, "'");
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const signedPct = (x: number) => `${x > 0 ? '+' : ''}${formatPercent(x)}`;
const tone = (x: number | null | undefined) => (x === null || x === undefined || x === 0 ? 'text-muted' : x > 0 ? 'text-accent' : 'text-danger');

export function InvestPage() {
  const { data, update } = useStore();
  const inv = data.investments ?? emptyInvestments();
  const summary = summarizePortfolio(inv);
  const [config, setConfig] = useState<QuoteConfig | null>(loadQuoteConfig);
  const [status, setStatus] = useState<{ busy: boolean; text?: string; error?: boolean }>({ busy: false });
  const [openId, setOpenId] = useState<string | null>(null);

  const updateInv = (fn: (i: Investments) => void) =>
    update((d) => {
      d.investments ??= emptyInvestments();
      fn(d.investments);
    });

  const refresh = async () => {
    if (!config || status.busy) return;
    const holdings = inv.holdings;
    const fxList = neededFx(inv);
    const total = holdings.length + fxList.length;
    let calls = 0;
    const errors: string[] = [];
    const pace = async () => {
      calls++;
      if (config.provider === 'twelvedata' && calls > 1 && (calls - 1) % TWELVE_PER_MINUTE === 0) {
        setStatus({ busy: true, text: `${calls - 1} von ${total} geladen. Limit des Gratis-Angebots: kurze Pause von einer Minute …` });
        await sleep(61_000);
      }
    };
    setStatus({ busy: true, text: `Lade Kurse … 0 von ${total}` });
    try {
      for (const h of holdings) {
        await pace();
        try {
          const qte = await fetchQuote(config, h.symbol, h.exchange);
          updateInv((i) => {
            const t = i.holdings.find((x) => x.id === h.id);
            if (!t) return;
            t.quote = { price: qte.price, changePct: qte.changePct, asOf: qte.asOf };
            if (qte.currency && qte.currency !== t.currency) t.currency = qte.currency;
          });
        } catch (e) {
          if (e instanceof QuoteError && (e.kind === 'limit' || e.kind === 'network')) throw e;
          errors.push(`${h.name}: ${e instanceof Error ? e.message : 'Fehler'}`);
        }
        setStatus({ busy: true, text: `Lade Kurse … ${calls} von ${total}` });
      }
      for (const cur of fxList) {
        await pace();
        try {
          const rate = await fetchFxToChf(config, cur);
          updateInv((i) => void (i.fx[cur] = { rate, asOf: new Date().toISOString() }));
        } catch (e) {
          if (e instanceof QuoteError && (e.kind === 'limit' || e.kind === 'network')) throw e;
          errors.push(`Wechselkurs ${cur}: ${e instanceof Error ? e.message : 'Fehler'}`);
        }
      }
      setStatus({ busy: false, text: errors.length ? errors.join(' · ') : `Aktualisiert ${fmtTime(new Date().toISOString())}`, error: errors.length > 0 });
    } catch (e) {
      setStatus({ busy: false, text: e instanceof Error ? e.message : 'Abfrage fehlgeschlagen.', error: true });
    }
  };

  const warnings = summary.missing.map((p) =>
    p.price === null ? `${p.holding.name}: kein Kurs. Kurse aktualisieren oder Kurs von Hand eintragen.` : `${p.holding.name}: Wechselkurs ${p.holding.currency} → CHF fehlt.`,
  );

  return (
    <>
      <SavingsAreaHeader
        area="invest"
        action={config && inv.holdings.length > 0 && (
          <Button variant="primary" onClick={() => void refresh()}>
            {status.busy ? 'Lädt …' : 'Kurse aktualisieren'}
          </Button>
        )}
      />
      {status.text && <p role="status" className={cx('mb-3 text-xs', status.error ? 'text-warn' : 'text-muted')}>{status.text}</p>}
      <Warnings items={warnings} />
      <div className="sa-columns">
        <PortfolioOverview summary={summary}/>
        <div className="min-w-0 [&>section]:mt-0"><InvestmentImport/></div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Positionen" className="lg:col-span-2">
          {inv.holdings.length === 0 && <p className="text-sm text-muted">Noch keine Positionen. Füge unten eine Aktie hinzu.</p>}
          <ul className="divide-y divide-line">
            {summary.positions.map((p) => (
              <PositionRow
                key={p.holding.id}
                p={p}
                share={summary.weights.find((w) => w.id === p.holding.id)?.share ?? 0}
                open={openId === p.holding.id}
                onToggle={() => setOpenId(openId === p.holding.id ? null : p.holding.id)}
                onChange={(fn) => updateInv((i) => {
                  const t = i.holdings.find((x) => x.id === p.holding.id);
                  if (t) fn(t);
                })}
                onDelete={() => {
                  if (window.confirm(`${p.holding.name} entfernen?`)) updateInv((i) => void (i.holdings = i.holdings.filter((x) => x.id !== p.holding.id)));
                }}
              />
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <AddHolding config={config} onAdd={(h) => updateInv((i) => void i.holdings.push(h))} />
          <ProviderCard config={config} onChange={(c) => { saveQuoteConfig(c); setConfig(c); }} />
        </div>
      </div>

      <div className="mt-4"><WealthCard/></div>
      <p className="mt-6 text-xs text-muted">
        Für die Vermögenssteuer zählt der Depotwert am 31.12. Trage ihn unter <a className="text-accent underline" href="#tax">Steuern → Vermögen 31.12.</a> ein, zusammen mit deinen Konten.
      </p>
    </>
  );
}

function PositionRow({
  p,
  share,
  open,
  onToggle,
  onChange,
  onDelete,
}: {
  p: HoldingValue;
  share: number;
  open: boolean;
  onToggle: () => void;
  onChange: (fn: (h: Holding) => void) => void;
  onDelete: () => void;
}) {
  const h = p.holding;
  return (
    <li className="py-3">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={onToggle}>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{h.name}</div>
          <div className="truncate text-xs text-muted">
            {fmtNum(h.quantity, h.quantity % 1 ? 3 : 0)} × {p.price !== null ? `${fmtNum(p.price)} ${h.currency}` : 'kein Kurs'} · {h.symbol}
            {h.exchange ? ` · ${h.exchange}` : ''}
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-panel-2">
            <div className="h-1 rounded-full bg-accent/70" style={{ width: `${Math.round(share * 100)}%` }} />
          </div>
        </div>
        <div className="text-right">
          <div className="num font-semibold">{p.valueChf !== null ? <Money value={p.valueChf} decimals={false} /> : '–'}</div>
          <div className={cx('num text-xs', tone(h.quote?.changePct))}>
            {h.quote?.changePct !== undefined ? signedPct(h.quote.changePct / 100) : p.priceSource === 'manual' ? 'von Hand' : ''}
          </div>
          {p.gainPct !== null && <div className={cx('num text-xs', tone(p.gainPct))}>{signedPct(p.gainPct)} total</div>}
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-2 rounded-xl bg-panel-2 p-3 text-sm">
          <Field label="Stück">
            <input
              type="number"
              inputMode="decimal"
              className="w-28 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-right"
              value={h.quantity}
              onChange={(e) => onChange((t) => void (t.quantity = Math.max(0, Number(e.target.value) || 0)))}
            />
          </Field>
          <Field label="Einstand total (CHF)">
            <MoneyInput value={h.costChf ?? 0} onChange={(v) => onChange((t) => void (t.costChf = v || undefined))} />
          </Field>
          <Field label="Währung">
            <Select value={h.currency} options={[...new Set([h.currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={(v) => onChange((t) => void (t.currency = v))} />
          </Field>
          <Field label={`Kurs von Hand (${h.currency})`}>
            <input
              type="number"
              inputMode="decimal"
              className="w-28 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-right"
              value={h.manualPrice ?? ''}
              placeholder="–"
              onChange={(e) => onChange((t) => void (t.manualPrice = e.target.value === '' ? undefined : Number(e.target.value)))}
            />
          </Field>
          {h.quote && (
            <Row
              label="Letzter Kurs vom Kursdienst"
              value={
                <span className="flex items-center gap-2">
                  {fmtNum(h.quote.price)} {h.currency} <span className="text-xs text-muted">{fmtTime(h.quote.asOf)}</span>
                  <button className="text-xs text-muted hover:text-danger" onClick={() => onChange((t) => void delete t.quote)}>
                    löschen
                  </button>
                </span>
              }
            />
          )}
          {p.fxRate !== null && h.currency !== 'CHF' && <Row label="Wechselkurs zu CHF" value={fmtNum(p.fxRate, 4)} />}
          <div className="pt-1 text-right">
            <Button variant="danger" onClick={onDelete}>
              Entfernen
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

function AddHolding({ config, onAdd }: { config: QuoteConfig | null; onAdd: (h: Holding) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SymbolMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<Holding> | null>(null);

  const search = async () => {
    if (!config || !query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchSymbols(config, query.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suche fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft?.symbol || !draft.name || !(draft.quantity! > 0)) return;
    onAdd({
      id: newId(),
      symbol: draft.symbol.trim().toUpperCase(),
      exchange: draft.exchange?.trim() || undefined,
      name: draft.name.trim(),
      currency: draft.currency || 'CHF',
      quantity: draft.quantity!,
      costChf: draft.costChf || undefined,
      manualPrice: draft.manualPrice,
    });
    setDraft(null);
    setResults(null);
    setQuery('');
  };

  if (draft) {
    return (
      <Card title="Position hinzufügen">
        <div className="space-y-2 text-sm">
          <Field label="Name">
            <input className="w-44 rounded-lg border border-line bg-bg px-2.5 py-1.5" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Symbol">
            <input className="w-32 rounded-lg border border-line bg-bg px-2.5 py-1.5" value={draft.symbol ?? ''} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} />
          </Field>
          <Field label="Börse (optional)">
            <input className="w-32 rounded-lg border border-line bg-bg px-2.5 py-1.5" value={draft.exchange ?? ''} onChange={(e) => setDraft({ ...draft, exchange: e.target.value })} />
          </Field>
          <Field label="Währung">
            <Select value={draft.currency ?? 'CHF'} options={[...new Set([draft.currency ?? 'CHF', ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={(v) => setDraft({ ...draft, currency: v })} />
          </Field>
          <Field label="Stück">
            <input
              type="number"
              inputMode="decimal"
              className="w-28 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-right"
              value={draft.quantity ?? ''}
              onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || undefined })}
            />
          </Field>
          <Field label="Einstand total (CHF)">
            <MoneyInput value={draft.costChf ?? 0} onChange={(v) => setDraft({ ...draft, costChf: v })} />
          </Field>
          {!config && (
            <Field label={`Kurs (${draft.currency ?? 'CHF'})`}>
              <input
                type="number"
                inputMode="decimal"
                className="w-28 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-right"
                value={draft.manualPrice ?? ''}
                onChange={(e) => setDraft({ ...draft, manualPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={save}>
              Hinzufügen
            </Button>
          </div>
          {!(draft.quantity! > 0) && <p className="text-xs text-muted">Stückzahl eingeben.</p>}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Position hinzufügen">
      {config ? (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
              placeholder="Name oder Symbol, z. B. Nestlé"
              aria-label="Aktie suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" variant="primary">
              {busy ? '…' : 'Suchen'}
            </Button>
          </form>
          {error && <p className="mt-2 text-xs text-warn">{error}</p>}
          {results && results.length === 0 && <p className="mt-2 text-xs text-muted">Nichts gefunden.</p>}
          {results && results.length > 0 && (
            <ul className="mt-2 max-h-72 divide-y divide-line overflow-auto rounded-lg border border-line">
              {results.map((r) => (
                <li key={`${r.symbol}-${r.exchange ?? ''}-${r.country ?? ''}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-panel-2"
                    onClick={() => setDraft({ symbol: r.symbol, name: r.name, exchange: r.exchange, currency: r.currency ?? 'CHF' })}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{r.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.symbol}
                        {r.exchange ? ` · ${r.exchange}` : ''}
                        {r.country ? ` · ${r.country}` : ''}
                        {r.type ? ` · ${r.type}` : ''}
                      </span>
                    </span>
                    {r.currency && <Badge>{r.currency}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="mt-3 text-xs text-muted hover:text-text" onClick={() => setDraft({ currency: 'CHF' })}>
            Ohne Suche von Hand erfassen
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Ohne Kursdienst trägst du den Kurs selbst ein. Mit API-Key sucht Frank Titel und lädt Kurse.</p>
          <div className="mt-3">
            <Button variant="primary" onClick={() => setDraft({ currency: 'CHF' })}>
              Position erfassen
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ProviderCard({ config, onChange }: { config: QuoteConfig | null; onChange: (c: QuoteConfig | null) => void }) {
  const [provider, setProvider] = useState<QuoteProvider>(config?.provider ?? 'twelvedata');
  const [key, setKey] = useState(config?.apiKey ?? '');
  const info = PROVIDERS[provider];

  return (
    <details className="sa-surface sa-disclosure">
      <summary><span>Kursdienst {config ? <Badge tone="good">aktiv</Badge> : <Badge>aus</Badge>}</span></summary>
      <label className="block text-xs text-muted">
        Anbieter
        <Select<QuoteProvider>
          className="mt-1 block w-full"
          value={provider}
          options={(Object.keys(PROVIDERS) as QuoteProvider[]).map((p) => ({ value: p, label: PROVIDERS[p].label }))}
          onChange={setProvider}
        />
      </label>
      <label className="mt-3 block text-xs text-muted">
        API-Key
        <input
          type="password"
          autoComplete="off"
          className="mt-1 block w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
          value={key}
          onChange={(e) => setKey(e.target.value.trim())}
          placeholder="Schlüssel einfügen"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => key && onChange({ provider, apiKey: key })}>
          Speichern
        </Button>
        {config && (
          <Button
            variant="ghost"
            onClick={() => {
              setKey('');
              onChange(null);
            }}
          >
            Key entfernen
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        {info.limits}{' '}
        <a className="text-info underline" href={info.signup} target="_blank" rel="noreferrer">
          Gratis-Key holen
        </a>
      </p>
      <p className="mt-2 text-xs text-muted">
        Der Key bleibt auf diesem Gerät und ist nicht im Backup. An den Kursdienst gehen nur Symbole und Währungen, keine Stückzahlen oder Beträge.
      </p>
    </details>
  );
}
