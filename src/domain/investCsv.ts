import { parseAmount, parseDate, type CsvTable } from './bankCsv';
import type { Rappen } from './money';
import { isSourceColumn, statementSource } from './statementIdentity';

export const investmentKinds = { buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende' } as const;
type Kind = keyof typeof investmentKinds;

export interface InvestmentTransaction {
  accountId: string;
  date: string;
  kind: Kind;
  security: string;
  amount: Rappen; // Abgerechneter CHF-Betrag, Kauf negativ.
  brokerId?: string;
  isin?: string;
  symbol?: string;
  quantity?: number;
}

const norm = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const kindAliases: Record<string, Kind> = {
  kauf: 'buy', buy: 'buy', purchase: 'buy', achat: 'buy',
  verkauf: 'sell', sale: 'sell', sell: 'sell', vente: 'sell',
  dividende: 'dividend', dividend: 'dividend', dividends: 'dividend', ausschuttung: 'dividend', dividendengutschrift: 'dividend',
};

function investColumns(header: string[]) {
  const keys = header.map(norm);
  const find = (...aliases: string[]) => aliases.map(a => keys.indexOf(a)).find(i => i >= 0) ?? -1;
  return {
    date: find('datum', 'buchungsdatum', 'transaktionsdatum', 'handelsdatum', 'date', 'trade date', 'transaction date', 'valuta'),
    kind: find('typ', 'art', 'vorgang', 'transaktionstyp', 'transaktionsart', 'geschaftsart', 'type', 'transaction', 'action', 'transaction type', 'side'),
    name: find('wertpapier', 'instrument', 'name', 'bezeichnung', 'titel', 'security', 'security name', 'product', 'beschreibung'),
    isin: find('isin'), symbol: find('symbol', 'ticker', 'ticker symbol', 'borsensymbol'),
    amountChf: find('betrag chf', 'nettobetrag chf', 'betrag netto chf', 'amount chf', 'net amount chf', 'cash amount chf'),
    amount: find('betrag', 'nettobetrag', 'betrag netto', 'gesamtbetrag', 'amount', 'net amount', 'cash amount', 'settlement amount', 'total'),
    currency: find('wahrung', 'waehrung', 'abrechnungswahrung', 'currency', 'settlement currency', 'ccy'),
    quantity: find('anzahl', 'menge', 'stuck', 'stuckzahl', 'quantity', 'shares', 'units', 'qty'),
    brokerId: find('transaktions id', 'transaktionsid', 'transaction id', 'transactionid', 'broker id', 'referenz', 'reference', 'id'),
    source: header.findIndex(isSourceColumn),
  };
}

function canonicalDepot(value: string): string {
  const compact = value.trim().replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact) ? compact : value.trim();
}

export function investmentSources(table: CsvTable): string[] {
  const { source } = investColumns(table.header);
  if (source < 0) return table.statement?.source ? [canonicalDepot(table.statement.source)] : [];
  return [...new Set(table.rows.map(row => canonicalDepot(statementSource(row, source, table.statement))))];
}

export function investmentFingerprint(t: InvestmentTransaction): string {
  return JSON.stringify([t.date, t.kind, t.isin?.toUpperCase() || t.symbol?.toUpperCase() || norm(t.security), t.amount, t.quantity ?? null]);
}

export function parseInvestmentTable(table: CsvTable, accountId: string, existing: InvestmentTransaction[], source?: string) {
  const cols = investColumns(table.header);
  if (cols.date < 0 || cols.kind < 0 || Math.max(cols.name, cols.isin, cols.symbol) < 0 || Math.max(cols.amountChf, cols.amount) < 0) {
    throw new Error('Die CSV braucht Datum, Typ, Wertpapier (oder ISIN bzw. Symbol) und Betrag.');
  }
  if (source === undefined && investmentSources(table).length > 1) throw new Error('Wähle das Quelldepot aus der CSV.');
  const valid: InvestmentTransaction[] = [];
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const selectedSource = source === undefined ? undefined : canonicalDepot(source);
  for (const row of table.rows) {
    const field = (key: keyof typeof cols) => row[cols[key]]?.trim() ?? '';
    if (selectedSource !== undefined && canonicalDepot(statementSource(row, cols.source, table.statement)) !== selectedSource) continue;
    const date = parseDate(field('date'));
    const kindKey = norm(field('kind'));
    const kind = Object.hasOwn(kindAliases, kindKey) ? kindAliases[kindKey] : undefined;
    if (!kind) { skip('anderer Geschäftstyp'); continue; }
    const isin = field('isin'), symbol = field('symbol'), security = field('name') || isin || symbol;
    const converted = field('amountChf');
    if (!converted && cols.currency >= 0 && field('currency').toUpperCase() !== 'CHF') { skip('kein CHF-Betrag'); continue; }
    const raw = parseAmount((converted || field('amount')).replace('−', '-'));
    const qtyRaw = field('quantity').replace(/[’'\s]/g, '').replace(',', '.');
    const qty = qtyRaw ? Number(qtyRaw) : undefined;
    if (!date || !security || raw === null || !Number.isSafeInteger(raw) || !raw ||
        (qty !== undefined && (!/^[+-]?\d+(?:\.\d+)?$/.test(qtyRaw) || !Number.isFinite(qty) || (kind === 'buy' && qty < 0)))) {
      skip('ungültige Angaben'); continue;
    }
    if (kind !== 'buy' && raw < 0) { skip('Storno oder negative Gutschrift'); continue; }
    const brokerId = field('brokerId');
    const entry: InvestmentTransaction = { date, kind, security, accountId, amount: kind === 'buy' ? -Math.abs(raw) : raw,
      ...(isin && { isin }), ...(symbol && { symbol }), ...(brokerId && { brokerId }), ...(qty !== undefined && { quantity: Math.abs(qty) }) };
    valid.push(entry);
  }
  // Reserve exact broker-ID matches first. Then use each remaining saved fill once
  // to match anonymous rows. This also preserves equal fills within a statement.
  const saved = existing.filter(row => row.accountId === accountId);
  const byId = new Map(saved.filter(row => row.brokerId).map(row => [row.brokerId!, row]));
  const matchedSaved = new Set<InvestmentTransaction>();
  const excluded = new Set<InvestmentTransaction>();
  const seenIds = new Map<string, string>();
  for (const row of valid) {
    if (!row.brokerId) continue;
    const fp = investmentFingerprint(row);
    const old = byId.get(row.brokerId);
    const prior = old ? investmentFingerprint(old) : seenIds.get(row.brokerId);
    if (prior !== undefined) {
      excluded.add(row);
      skip(prior === fp ? 'bereits vorhanden' : 'Broker-ID mit abweichenden Daten');
      if (old && prior === fp) matchedSaved.add(old);
    }
    seenIds.set(row.brokerId, fp);
  }
  const pools = new Map<string, { anonymous: number; identified: number }>();
  for (const row of saved) {
    if (matchedSaved.has(row)) continue;
    const fp = investmentFingerprint(row);
    const pool = pools.get(fp) ?? { anonymous: 0, identified: 0 };
    if (row.brokerId) pool.identified++; else pool.anonymous++;
    pools.set(fp, pool);
  }
  // Distinct explicit IDs always mean distinct trades. New IDs may only match
  // previously anonymous fills, so process them before the anonymous remainder.
  for (const withId of [true, false]) {
    for (const row of valid) {
      if (Boolean(row.brokerId) !== withId || excluded.has(row)) continue;
      const pool = pools.get(investmentFingerprint(row));
      if (!pool) continue;
      if (!withId && pool.identified > 0) pool.identified--;
      else if (pool.anonymous > 0) pool.anonymous--;
      else continue;
      excluded.add(row);
      skip('bereits vorhanden');
    }
  }
  return { rows: valid.filter(row => !excluded.has(row)), skipped };
}
