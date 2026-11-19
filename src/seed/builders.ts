import { chf } from '../domain/money';
import type {
  Account,
  BudgetCategory,
  BudgetItem,
  Frequency,
  SalaryInput,
  SocialRates,
  TaxProfile,
  YearPlan,
} from '../domain/types';

let counter = 0;
export const uid = (prefix = 'id'): string =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'main', name: 'Lohnkonto', type: 'checking' },
  { id: 'savings', name: 'Sparkonto', type: 'savings' },
  { id: 'invest', name: 'Depot', type: 'investment' },
  { id: 'p3a', name: 'Säule 3a', type: 'pillar3a' },
];

export const RATES_2026: SocialRates = { ahv: 0.053, alv: 0.011, nbuv: 0.0093, ktg: 0.0035 };

/** Budgetposten in CHF (wird intern in Rappen umgerechnet). */
export function item(
  category: BudgetCategory,
  name: string,
  amountChf: number,
  opts: Partial<Omit<BudgetItem, 'id' | 'category' | 'name' | 'amount'>> & { frequency?: Frequency } = {},
): BudgetItem {
  return {
    id: uid('b'),
    category,
    name,
    amount: chf(amountChf),
    frequency: opts.frequency ?? { kind: 'monthly' },
    ...opts,
  };
}

export function salary(grossChf: number, bvgChf: number, rates: SocialRates = RATES_2026): SalaryInput {
  return {
    grossMonthly: chf(grossChf),
    changes: [],
    thirteenth: [
      { month: 6, share: 0.5 },
      { month: 12, share: 0.5 },
    ],
    bonuses: [],
    rates,
    bvgMonthly: chf(bvgChf),
  };
}

export const DEFAULT_TAX_PROFILE: TaxProfile = {
  commuteMode: 'bike',
  commuteCosts: chf(700),
  meal: 'none',
  otherDeductions: 0,
  ktgDeductible: true,
  wealth: 0,
};

export function emptyYear(year: number, template?: YearPlan): YearPlan {
  if (template) {
    return {
      ...structuredClone(template),
      year,
      actualTax: undefined,
      salaryCertificate: undefined,
      monthlyPayslips: undefined,
      note: `Kopie von ${template.year}`,
      budget: template.budget.map((b) => ({ ...structuredClone(b), id: uid('b') })),
    };
  }
  return {
    year,
    salary: salary(5000, 200),
    otherIncome: [],
    budget: [],
    tax: { ...DEFAULT_TAX_PROFILE },
    extrasAllocation: [],
    startBalances: {},
  };
}
