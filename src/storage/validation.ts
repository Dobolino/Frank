import type { AppData } from '../domain/types';

const invalid = (path: string): never => { throw new Error(`Ungültiges Feld im Backup: ${path}.`); };
const object = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  return value as Record<string, unknown>;
};
const array = (value: unknown, path: string): unknown[] => Array.isArray(value) ? value : invalid(path);
const text = (value: unknown, path: string): string => typeof value === 'string' ? value : invalid(path);
const number = (value: unknown, path: string): number => typeof value === 'number' && Number.isFinite(value) ? value : invalid(path);
const integer = (value: unknown, path: string): number => Number.isSafeInteger(number(value, path)) ? value as number : invalid(path);
const boolean = (value: unknown, path: string) => typeof value === 'boolean' || invalid(path);
const choice = (value: unknown, choices: readonly string[], path: string) => choices.includes(text(value, path)) || invalid(path);
const optional = (o: Record<string, unknown>, key: string, check: (value: unknown, path: string) => unknown, path: string) => {
  if (o[key] !== undefined) check(o[key], `${path}.${key}`);
};
const month = (value: unknown, path: string) => {
  const n = integer(value, path);
  if (n < 1 || n > 12) invalid(path);
};
const yearMonth = (value: unknown, path: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(text(value, path)) || invalid(path);
const identified = (value: unknown, path: string): Record<string, unknown>[] => {
  const ids = new Set<string>();
  return array(value, path).map((item, i) => {
    const o = object(item, `${path}[${i}]`);
    const id = text(o.id, `${path}[${i}].id`);
    if (!id || ids.has(id)) invalid(`${path}[${i}].id`);
    ids.add(id);
    return o;
  });
};

/** Validate the complete shape before any imported data reaches the calculators. */
export function validateAppData(value: Record<string, unknown>): asserts value is Record<string, unknown> & AppData {
  const profile = object(value.profile, 'profile');
  text(profile.municipality, 'profile.municipality');
  choice(profile.canton, ['AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR', 'JU', 'LU', 'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH'], 'profile.canton');
  choice(profile.civilStatus, ['single', 'married'], 'profile.civilStatus');
  optional(profile, 'children', (v, path) => {
    const ages = array(v, path);
    if (ages.length > 15) invalid(path);
    ages.forEach((a, i) => {
      const n = integer(a, `${path}[${i}]`);
      if (n < 0 || n > 30) invalid(`${path}[${i}]`);
    });
  }, 'profile');
  choice(profile.church, ['none', 'protestant', 'roman', 'christ'], 'profile.church');
  optional(profile, 'bfsId', integer, 'profile');

  const accounts = identified(value.accounts, 'accounts');
  const goals = identified(value.goals, 'goals');
  const accountIds = new Set(accounts.map((a) => a.id));
  const goalIds = new Set(goals.map((g) => g.id));
  const reference = (ids: Set<unknown>) => (v: unknown, path: string) => ids.has(text(v, path)) || invalid(path);
  const account = reference(accountIds);
  const goal = reference(goalIds);
  for (const a of accounts) {
    text(a.name, 'accounts.name');
    choice(a.type, ['checking', 'savings', 'investment', 'pillar3a'], 'accounts.type');
  }
  for (const g of goals) {
    text(g.name, 'goals.name');
    integer(g.target, 'goals.target');
    integer(g.saved, 'goals.saved');
    yearMonth(g.dueDate, 'goals.dueDate');
    optional(g, 'accountId', account, 'goals');
    optional(g, 'emoji', text, 'goals');
  }

  // Older backups have no portfolio. Preserve valid optional holdings and cached
  // quotes unchanged while rejecting malformed entries before Dashboard renders.
  optional(value, 'investments', (v, path) => {
    const investments = object(v, path);
    for (const holding of identified(investments.holdings, `${path}.holdings`)) {
      const p = `${path}.holdings.${holding.id}`;
      for (const key of ['symbol', 'name', 'currency']) text(holding[key], `${p}.${key}`);
      number(holding.quantity, `${p}.quantity`);
      optional(holding, 'exchange', text, p);
      optional(holding, 'costChf', integer, p);
      optional(holding, 'manualPrice', number, p);
      optional(holding, 'quote', (v, path) => {
        const quote = object(v, path);
        number(quote.price, `${path}.price`);
        optional(quote, 'changePct', number, path);
        text(quote.asOf, `${path}.asOf`);
      }, p);
    }
    for (const [currency, rawRate] of Object.entries(object(investments.fx, `${path}.fx`))) {
      const p = `${path}.fx.${currency}`;
      const rate = object(rawRate, p);
      number(rate.rate, `${p}.rate`);
      text(rate.asOf, `${p}.asOf`);
    }
  }, 'data');

  const years = object(value.years, 'years');
  if (Object.keys(years).length === 0) throw new Error('Das Backup muss mindestens ein vollständiges Jahr enthalten.');
  for (const [key, rawPlan] of Object.entries(years)) {
    const p = `years.${key}`;
    const plan = object(rawPlan, p);
    const year = integer(plan.year, `${p}.year`);
    if (year < 1 || year > 9999 || key !== String(year)) invalid(`${p}.year`);
    const salary = object(plan.salary, `${p}.salary`);
    integer(salary.grossMonthly, `${p}.salary.grossMonthly`);
    integer(salary.bvgMonthly, `${p}.salary.bvgMonthly`);
    const rates = object(salary.rates, `${p}.salary.rates`);
    for (const key of ['ahv', 'alv', 'nbuv', 'ktg']) number(rates[key], `${p}.salary.rates.${key}`);
    for (const rawChange of array(salary.changes, `${p}.salary.changes`)) {
      const c = object(rawChange, `${p}.salary.changes`);
      month(c.fromMonth, `${p}.salary.changes.fromMonth`);
      integer(c.grossMonthly, `${p}.salary.changes.grossMonthly`);
    }
    for (const rawPayout of array(salary.thirteenth, `${p}.salary.thirteenth`)) {
      const t = object(rawPayout, `${p}.salary.thirteenth`);
      month(t.month, `${p}.salary.thirteenth.month`);
      if (t.share === undefined && t.amount === undefined) invalid(`${p}.salary.thirteenth`);
      optional(t, 'share', number, `${p}.salary.thirteenth`);
      optional(t, 'amount', integer, `${p}.salary.thirteenth`);
    }
    for (const rawBonus of array(salary.bonuses, `${p}.salary.bonuses`)) {
      const b = object(rawBonus, `${p}.salary.bonuses`);
      month(b.month, `${p}.salary.bonuses.month`);
      integer(b.gross, `${p}.salary.bonuses.gross`);
    }
    optional(salary, 'expenseAllowance', (raw, path) => {
      const e = object(raw, path);
      integer(e.monthly, `${path}.monthly`);
      boolean(e.taxable, `${path}.taxable`);
    }, `${p}.salary`);

    for (const b of identified(plan.budget, `${p}.budget`)) {
      text(b.name, `${p}.budget.name`);
      integer(b.amount, `${p}.budget.amount`);
      choice(b.category, ['fixed', 'household', 'personal', 'mobility', 'savings'], `${p}.budget.category`);
      const f = object(b.frequency, `${p}.budget.frequency`);
      choice(f.kind, ['monthly', 'yearly', 'quarterly', 'custom'], `${p}.budget.frequency.kind`);
      if (f.kind === 'yearly') month(f.month, `${p}.budget.frequency.month`);
      if (f.kind === 'quarterly' || f.kind === 'custom') {
        const months = array(f.months, `${p}.budget.frequency.months`);
        months.forEach((m) => month(m, `${p}.budget.frequency.months`));
        if (new Set(months).size !== months.length) invalid(`${p}.budget.frequency.months`);
      }
      optional(b, 'accountId', account, `${p}.budget`);
      optional(b, 'goalId', goal, `${p}.budget`);
      optional(b, 'taxTag', (v, path) => choice(v, ['insurance', 'pillar3a', 'taxProvision'], path), `${p}.budget`);
      optional(b, 'autoFromTax', boolean, `${p}.budget`);
      optional(b, 'note', text, `${p}.budget`);
      optional(b, 'children', (v, path) => {
        for (const child of identified(v, path)) {
          text(child.name, `${path}.name`);
          integer(child.amount, `${path}.amount`);
        }
      }, `${p}.budget`);
    }
    for (const i of identified(plan.otherIncome, `${p}.otherIncome`)) {
      text(i.name, `${p}.otherIncome.name`);
      integer(i.amount, `${p}.otherIncome.amount`);
      choice(i.kind, ['dividend', 'interest', 'sideJob', 'other'], `${p}.otherIncome.kind`);
      optional(i, 'month', month, `${p}.otherIncome`);
    }
    const tax = object(plan.tax, `${p}.tax`);
    choice(tax.commuteMode, ['none', 'bike', 'publicTransport', 'car'], `${p}.tax.commuteMode`);
    choice(tax.meal, ['none', 'full', 'reduced'], `${p}.tax.meal`);
    boolean(tax.ktgDeductible, `${p}.tax.ktgDeductible`);
    for (const key of ['commuteCosts', 'otherDeductions', 'wealth']) integer(tax[key], `${p}.tax.${key}`);
    for (const key of ['rentDeduction', 'insurancePremiumsOverride']) optional(tax, key, integer, `${p}.tax`);
    optional(tax, 'includeDepot', boolean, `${p}.tax`);
    optional(tax, 'partnerNet', integer, `${p}.tax`);
    optional(plan, 'actualTax', (v, path) => {
      const a = object(v, path);
      optional(a, 'federal', integer, path);
      optional(a, 'cantonMunicipal', integer, path);
      optional(a, 'note', text, path);
    }, p);
    for (const allocation of identified(plan.extrasAllocation, `${p}.extrasAllocation`)) {
      number(allocation.share, `${p}.extrasAllocation.share`);
      optional(allocation, 'accountId', account, `${p}.extrasAllocation`);
      optional(allocation, 'goalId', goal, `${p}.extrasAllocation`);
    }
    for (const [id, amount] of Object.entries(object(plan.startBalances, `${p}.startBalances`))) {
      account(id, `${p}.startBalances.${id}`);
      integer(amount, `${p}.startBalances.${id}`);
    }
    optional(plan, 'note', text, p);
  }
  const importAccounts = value.importAccounts === undefined ? [] : identified(value.importAccounts, 'importAccounts');
  for (const a of importAccounts) {
    for (const key of ['name', 'bankId']) if (!text(a[key], `importAccounts.${key}`).trim()) invalid(`importAccounts.${key}`);
    choice(a.type, ['bank', 'card', 'depot'], 'importAccounts.type');
  }
  const expenseAccount = reference(new Set(importAccounts.filter(a => a.type !== 'depot').map(a => a.id)));
  const depot = reference(new Set(importAccounts.filter(a => a.type === 'depot').map(a => a.id)));
  optional(value, 'investmentTransactions', (v, path) => {
    array(v, path).forEach((entry, i) => {
      const p = `${path}[${i}]`;
      const t = object(entry, p);
      depot(t.accountId, `${p}.accountId`);
      choice(t.kind, ['buy', 'sell', 'dividend'], `${p}.kind`);
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(text(t.date, `${p}.date`))) invalid(`${p}.date`);
      if (!text(t.security, `${p}.security`).trim()) invalid(`${p}.security`);
      const amount = integer(t.amount, `${p}.amount`);
      if (t.kind === 'buy' ? amount >= 0 : amount <= 0) invalid(`${p}.amount`);
      for (const key of ['brokerId', 'isin', 'symbol']) optional(t, key, text, p);
      optional(t, 'quantity', (n, k) => number(n, k) >= 0 || invalid(k), p);
    });
  }, 'data');
  optional(value, 'customMerchants', (v, path) => {
    for (const m of identified(v, path)) {
      if (!text(m.name, `${path}.name`).trim()) invalid(`${path}.name`);
      optional(m, 'logo', (logo, p) => {
        const source = text(logo, p);
        if (source.length > 160000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(source)) invalid(p);
      }, path);
    }
  }, 'data');
  optional(value, 'merchantRules', (v, path) => {
    for (const entry of array(v, path)) {
      const r = object(entry, path);
      if (!text(r.match, `${path}.match`).trim()) invalid(`${path}.match`);
      text(r.merchantId, `${path}.merchantId`);
    }
  }, 'data');
  optional(value, 'transactions', (v, path) => {
    for (const [i, t] of identified(v, path).entries()) {
      const date = text(t.date, `${path}[${i}].date`);
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) invalid(`${path}[${i}].date`);
      text(t.text, `${path}[${i}].text`);
      integer(t.amount, `${path}[${i}].amount`);
      optional(t, 'accountId', expenseAccount, `${path}[${i}]`);
      optional(t, 'merchantId', text, `${path}[${i}]`);
      optional(t, 'excludedFromSpend', boolean, `${path}[${i}]`);
      optional(t, 'item', text, `${path}[${i}]`);
      optional(t, 'category', text, `${path}[${i}]`);
    }
  }, 'data');
  optional(value, 'rules', (v, path) => {
    array(v, path).forEach((entry, i) => {
      const r = object(entry, `${path}[${i}]`);
      if (!text(r.match, `${path}[${i}].match`)) invalid(`${path}[${i}].match`);
      text(r.item, `${path}[${i}].item`);
      optional(r, 'field', (v, p) => choice(v, ['category'], p), `${path}[${i}]`);
    });
  }, 'data');
  optional(value, 'wealthHistory', (v, path) => {
    const months = new Set<string>();
    array(v, path).forEach((entry, i) => {
      const e = object(entry, `${path}[${i}]`);
      yearMonth(e.month, `${path}[${i}].month`);
      if (months.has(e.month as string)) invalid(`${path}[${i}].month`);
      months.add(e.month as string);
      for (const key of ['accounts', 'depot', 'pillar3a']) integer(e[key], `${path}[${i}].${key}`);
    });
  }, 'data');
  optional(value, 'settings', (v, path) => {
    const settings = object(v, path);
    optional(settings, 'radar', (v, path) => {
      const radar = object(v, path);
      integer(radar.buffer, `${path}.buffer`);
      optional(radar, 'balance', integer, path);
      optional(radar, 'accountId', account, path);
      optional(radar, 'asOfYm', yearMonth, path);
    }, path);
  }, 'data');
}
