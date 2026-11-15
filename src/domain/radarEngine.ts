import { sum, type Rappen } from './money';
import { dueMonths, itemAmount, outflowsByMonth, standingOrders } from './budgetEngine';
import { addMonths } from './goalsEngine';
import type { MonthlySalary } from './salaryEngine';
import type { Account, BudgetItem, ExtrasAllocation, Month } from './types';

/**
 * Finanz-Radar: rollende 12-Monats-Vorschau eines Sparkontos ab heute,
 * über Jahresgrenzen hinweg, mit Ampel, Spar-Tipp und einmaligen Ausgaben.
 */

export type RadarLevel = 'green' | 'yellow' | 'red';

/** Was die Vorschau pro Jahr braucht (aus dem Jahresmodell). */
export interface RadarYear {
  year: number;
  items: BudgetItem[];
  salaryMonths: MonthlySalary[];
  allocations: ExtrasAllocation[];
}

export interface OneOff {
  /** Monat im Format YYYY-MM. */
  ym: string;
  amount: Rappen;
  accountId: string;
}

export interface RadarPoint {
  ym: string;
  year: number;
  month: Month;
  inflow: Rappen;
  outflow: Rappen;
  bills: { name: string; amount: Rappen }[];
  balanceEnd: Rappen;
  /** true, wenn für dieses Jahr kein Plan existiert und das letzte bekannte Jahr angenommen wird. */
  assumed: boolean;
}

export interface RadarResult {
  account: Account;
  points: RadarPoint[];
  minBalance: Rappen;
  minYm: string;
  level: RadarLevel;
  /** Zusätzliche Monatsrate ab sofort, damit die Ampel grün bzw. das Konto im Plus bleibt. */
  catchUpMonthly: Rappen;
  /** Ziel, auf das der Tipp ausgerichtet ist (0 = nicht ins Minus, sonst Puffer). */
  catchUpTarget: Rappen;
}

export interface RadarParams {
  account: Account;
  accounts: Account[];
  getYear: (year: number) => RadarYear | null;
  startYm: string;
  startBalance: Rappen;
  buffer: Rappen;
  months?: number;
  oneOffs?: OneOff[];
}

const splitYm = (ym: string): [number, Month] => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return [y, m as Month];
};

/** Auf 10 Franken aufrunden. */
const ceilTo10 = (r: number): Rappen => Math.ceil(r / 1000 - 1e-9) * 1000;

export function levelFor(minBalance: Rappen, buffer: Rappen): RadarLevel {
  if (minBalance < 0) return 'red';
  if (minBalance < buffer) return 'yellow';
  return 'green';
}

/**
 * Nötige zusätzliche Monatsrate, damit der Kontostand in jedem Monat mindestens `target` erreicht.
 * Eine Rate ab Monat 1 wirkt in Monat i bereits (i+1)-mal.
 */
export function catchUp(balances: Rappen[], target: Rappen): Rappen {
  let need = 0;
  balances.forEach((b, i) => {
    if (b < target) need = Math.max(need, (target - b) / (i + 1));
  });
  return need > 0 ? ceilTo10(need) : 0;
}

export function runRadar(p: RadarParams): RadarResult {
  const count = p.months ?? 12;
  const knownYears: number[] = [];
  let balance = p.startBalance;
  const points: RadarPoint[] = [];

  for (let i = 0; i < count; i++) {
    const ym = addMonths(p.startYm, i);
    const [year, month] = splitYm(ym);
    let ctx = p.getYear(year);
    let assumed = false;
    if (ctx) knownYears.push(year);
    else {
      const fallbackYear = knownYears.length > 0 ? Math.max(...knownYears) : year - 1;
      ctx = p.getYear(fallbackYear);
      assumed = true;
    }
    if (!ctx) {
      points.push({ ym, year, month, inflow: 0, outflow: 0, bills: [], balanceEnd: balance, assumed: true });
      continue;
    }

    const order = standingOrders(ctx.items, p.accounts).find((o) => o.account.id === p.account.id)?.standingOrder ?? 0;
    const share = sum(ctx.allocations.filter((a) => a.accountId === p.account.id).map((a) => a.share));
    const extras = Math.round((ctx.salaryMonths[month - 1]?.extrasNet ?? 0) * share);
    const bills = ctx.items
      .filter((it) => it.accountId === p.account.id)
      .map((it) => ({ name: it.name, amount: outflowsByMonth(it)[month - 1] ?? 0 }))
      .filter((b) => b.amount > 0);
    for (const o of p.oneOffs ?? []) {
      if (o.ym === ym && o.accountId === p.account.id && o.amount > 0) bills.push({ name: 'Einmalige Ausgabe', amount: o.amount });
    }
    const outflow = sum(bills.map((b) => b.amount));
    const inflow = order + extras;
    balance += inflow - outflow;
    points.push({ ym, year, month, inflow, outflow, bills, balanceEnd: balance, assumed });
  }

  const min = points.reduce((a, b) => (b.balanceEnd < a.balanceEnd ? b : a), points[0]!);
  const level = levelFor(min.balanceEnd, p.buffer);
  const catchUpTarget = level === 'red' ? 0 : p.buffer;
  return {
    account: p.account,
    points,
    minBalance: min.balanceEnd,
    minYm: min.ym,
    level,
    catchUpMonthly: level === 'green' ? 0 : catchUp(points.map((x) => x.balanceEnd), catchUpTarget),
    catchUpTarget,
  };
}

export interface UpcomingBill {
  ym: string;
  name: string;
  amount: Rappen;
  accountId?: string;
}

/**
 * Grössere, nicht monatliche Rechnungen in den nächsten `months` Monaten (alle Konten).
 */
export function upcomingBills(
  getYear: (year: number) => RadarYear | null,
  startYm: string,
  months: number,
  minAmount: Rappen,
): UpcomingBill[] {
  const out: UpcomingBill[] = [];
  for (let i = 0; i < months; i++) {
    const ym = addMonths(startYm, i);
    const [year, month] = splitYm(ym);
    const ctx = getYear(year);
    if (!ctx) continue;
    for (const it of ctx.items) {
      if (it.frequency.kind === 'monthly') continue;
      if (!dueMonths(it.frequency).includes(month)) continue;
      const amount = itemAmount(it);
      if (amount >= minAmount) out.push({ ym, name: it.name, amount, accountId: it.accountId });
    }
  }
  return out;
}

/** true, wenn alle Posten eines Kontos monatlich sind – dann kann der Radar keine Engpässe erkennen. */
export const onlyMonthlyItems = (items: BudgetItem[], accountId: string): boolean => {
  const list = items.filter((i) => i.accountId === accountId);
  return list.length > 0 && list.every((i) => i.frequency.kind === 'monthly');
};
