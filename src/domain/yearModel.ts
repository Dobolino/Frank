import { sum, type Rappen } from './money';
import { calculateSalary, lohnausweisNet, type SalaryYear } from './salaryEngine';
import { calculateTax, type TaxInput, type TaxResult } from './tax/taxEngine';
import { standingOrders, summarizeBudget, yearlyByTaxTag, type AccountTransfer, type BudgetSummary } from './budgetEngine';
import { simulateAccounts, type AccountCashflow } from './cashflowEngine';
import { resolveBfsId, taxParamsFor, type TaxYearParams } from '../params/taxData';
import type { Account, BudgetItem, Profile, YearPlan } from './types';

export interface YearModel {
  plan: YearPlan;
  salary: SalaryYear;
  taxInput: TaxInput;
  tax: TaxResult;
  /** null, wenn für den Wohnort keine Steuerdaten vorliegen. */
  taxParams: TaxYearParams | null;
  taxParamsExact: boolean;
  /** Empfohlene monatliche Steuerrückstellung (auf 10 CHF aufgerundet). */
  taxProvisionSuggested: Rappen;
  taxProvisionBudgeted: Rappen;
  /** Budget mit automatisch berechneten Posten (z. B. Steuerrückstellung). */
  budget: BudgetItem[];
  summary: BudgetSummary;
  transfers: AccountTransfer[];
  cashflow: AccountCashflow[];
  otherIncomeYearly: Rappen;
  warnings: string[];
}

/** Auf 10 Franken aufrunden – runde Beträge für Daueraufträge. */
const ceilTo10Francs = (r: number): Rappen => Math.ceil(r / 1000 - 1e-9) * 1000;

/** depotChf: aktueller Depotwert, zählt zum Vermögen, wenn im Steuerprofil eingeschaltet. */
export function buildTaxInput(plan: YearPlan, salary: SalaryYear, depotChf: Rappen = 0, profile?: Profile): TaxInput {
  const married = profile?.civilStatus === 'married';
  const insuranceFromBudget = yearlyByTaxTag(plan.budget, 'insurance');
  return {
    employmentNet: lohnausweisNet(salary, plan.tax.ktgDeductible, plan.salary.expenseAllowance?.taxable ?? false),
    otherIncome: sum(plan.otherIncome.map((o) => o.amount)),
    commuteCosts: plan.tax.commuteMode === 'none' ? 0 : plan.tax.commuteCosts,
    commuteIsBike: plan.tax.commuteMode === 'bike',
    meal: plan.tax.meal,
    pillar3a: yearlyByTaxTag(plan.budget, 'pillar3a'),
    insurancePremiums: plan.tax.insurancePremiumsOverride ?? insuranceFromBudget,
    otherDeductions: plan.tax.otherDeductions,
    rentDeduction: plan.tax.rentDeduction ?? 0,
    wealth: plan.tax.wealth + (plan.tax.includeDepot ? depotChf : 0),
    married,
    children: profile?.children ?? [],
    partnerNet: married ? (plan.tax.partnerNet ?? 0) : 0,
  };
}

/** Zentrale Berechnung eines Jahres: Lohn → Steuern → Budget → Daueraufträge → Cashflow. */
export function buildYearModel(plan: YearPlan, accounts: Account[], profile: Profile, depotChf: Rappen = 0): YearModel {
  const salary = calculateSalary(plan.salary);
  const bfsId = resolveBfsId(profile);
  const lookup = bfsId === undefined ? { params: null, exact: false, note: 'Wähle deinen Wohnort auf der Seite «Steuern».' } : taxParamsFor(plan.year, bfsId, profile.church);
  const { params, exact } = lookup;
  const taxInput = buildTaxInput(plan, salary, depotChf, profile);
  const tax = params ? calculateTax(taxInput, params) : emptyTax(plan.year, taxInput);
  const taxProvisionSuggested = ceilTo10Francs(tax.total / 12);

  const budget = plan.budget.map((item) =>
    item.autoFromTax && item.taxTag === 'taxProvision'
      ? { ...item, amount: taxProvisionSuggested, frequency: { kind: 'monthly' as const }, children: undefined }
      : item,
  );
  const taxProvisionBudgeted = Math.round(yearlyByTaxTag(budget, 'taxProvision') / 12);

  const otherIncomeYearly = taxInput.otherIncome;
  const summary = summarizeBudget(budget, {
    regularNetMonthly: salary.regularNet,
    netYearly: salary.totals.net,
    otherYearly: otherIncomeYearly,
  });
  const transfers = standingOrders(budget, accounts);
  const cashflow = simulateAccounts({
    items: budget,
    accounts,
    salaryMonths: salary.months,
    allocations: plan.extrasAllocation,
    startBalances: plan.startBalances,
  });

  const warnings = [...tax.warnings];
  if (lookup.note) warnings.unshift(lookup.note);
  if (taxProvisionBudgeted < taxProvisionSuggested) {
    warnings.push('Die budgetierte Steuerrückstellung ist tiefer als die berechnete Steuer.');
  }
  for (const c of cashflow) {
    if (c.minBalance < 0) {
      warnings.push(`${c.account.name}: Kontostand fällt im ${c.minMonth}. Monat unter 0 – Startguthaben oder Dauerauftrag erhöhen.`);
    }
  }

  return {
    plan,
    salary,
    taxInput,
    tax,
    taxParams: params,
    taxParamsExact: exact,
    taxProvisionSuggested,
    taxProvisionBudgeted,
    budget,
    summary,
    transfers,
    cashflow,
    otherIncomeYearly,
    warnings,
  };
}

/** Platzhalter ohne Steuerdaten: alle Steuern 0, damit Budget und Übersicht weiter funktionieren. */
function emptyTax(year: number, input: TaxInput): TaxResult {
  const gross = input.employmentNet + input.otherIncome;
  const level = { grossIncome: gross, deductions: [], taxableIncome: 0 };
  return {
    year,
    federal: { ...level, tax: 0 },
    canton: {
      ...level,
      simpleTax: 0,
      cantonTax: 0,
      municipalTax: 0,
      churchTax: 0,
      personalTax: 0,
      wealthTaxable: 0,
      wealthCanton: 0,
      wealthMunicipal: 0,
      wealthChurch: 0,
    },
    total: 0,
    incomeTaxTotal: 0,
    wealthTaxTotal: 0,
    effectiveRate: 0,
    marginalRate: 0,
    warnings: [],
  };
}
