import { sum, type Rappen } from './money';
import { outflowsByMonth, standingOrders } from './budgetEngine';
import type { MonthlySalary } from './salaryEngine';
import { MONTHS, type Account, type BudgetItem, type ExtrasAllocation, type Month } from './types';

export interface CashflowMonth {
  month: Month;
  inflowStandingOrder: Rappen;
  inflowExtras: Rappen;
  outflow: Rappen;
  /** Fällige Posten in diesem Monat (nur Posten mit Zahlung > 0). */
  bills: { name: string; amount: Rappen }[];
  balanceEnd: Rappen;
}

export interface AccountCashflow {
  account: Account;
  standingOrder: Rappen;
  startBalance: Rappen;
  months: CashflowMonth[];
  minBalance: Rappen;
  minMonth: Month;
  endBalance: Rappen;
  /** Zusätzlicher Startbetrag, der nötig wäre, damit das Konto nie unter 0 fällt. */
  bufferNeeded: Rappen;
}

/**
 * Kontoverlauf pro Sparkonto über 12 Monate:
 * + Dauerauftrag + Anteil 13. Lohn/Bonus − fällige Rechnungen.
 */
export function simulateAccounts(params: {
  items: BudgetItem[];
  accounts: Account[];
  salaryMonths: MonthlySalary[];
  allocations: ExtrasAllocation[];
  startBalances: Record<string, Rappen>;
}): AccountCashflow[] {
  const orders = standingOrders(params.items, params.accounts);
  const relevant = params.accounts.filter(
    (a) => a.type !== 'checking' && (orders.some((o) => o.account.id === a.id) || params.allocations.some((x) => x.accountId === a.id)),
  );

  return relevant.map((account) => {
    const standingOrder = orders.find((o) => o.account.id === account.id)?.standingOrder ?? 0;
    const items = params.items.filter((i) => i.accountId === account.id);
    const flows = items.map((i) => ({ name: i.name, perMonth: outflowsByMonth(i) }));
    const share = sum(params.allocations.filter((a) => a.accountId === account.id).map((a) => a.share));
    const startBalance = params.startBalances[account.id] ?? 0;

    let balance = startBalance;
    const months: CashflowMonth[] = MONTHS.map((month, idx) => {
      const extras = params.salaryMonths[idx]?.extrasNet ?? 0;
      const inflowExtras = Math.round(extras * share);
      const bills = flows
        .map((f) => ({ name: f.name, amount: f.perMonth[idx] ?? 0 }))
        .filter((b) => b.amount > 0);
      const outflow = sum(bills.map((b) => b.amount));
      balance += standingOrder + inflowExtras - outflow;
      return { month, inflowStandingOrder: standingOrder, inflowExtras, outflow, bills, balanceEnd: balance };
    });

    const min = months.reduce((a, b) => (b.balanceEnd < a.balanceEnd ? b : a), months[0]!);
    return {
      account,
      standingOrder,
      startBalance,
      months,
      minBalance: min.balanceEnd,
      minMonth: min.month,
      endBalance: balance,
      bufferNeeded: Math.max(0, -min.balanceEnd),
    };
  });
}
