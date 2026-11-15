import { sum, type Rappen } from './money';
import { calculateSalary, lohnausweisNet, type SalaryYear } from './salaryEngine';
import { calculateTax, type TaxInput, type TaxResult } from './tax/taxEngine';
import { standingOrders, summarizeBudget, yearlyByTaxTag, type AccountTransfer, type BudgetSummary } from './budgetEngine';
import { simulateAccounts, type AccountCashflow } from './cashflowEngine';
import { taxParamsFor } from '../params/taxParams';
import type { Account, BudgetItem, YearPlan } from './types';

export interface YearModel {
  plan: YearPlan;
  salary: SalaryYear;
  taxInput: TaxInput;
  tax: TaxResult;
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

export function buildTaxInput(plan: YearPlan, salary: SalaryYear): TaxInput {
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
    wealth: plan.tax.wealth,
  };
}

/** Zentrale Berechnung eines Jahres: Lohn → Steuern → Budget → Daueraufträge → Cashflow. */
export function buildYearModel(plan: YearPlan, accounts: Account[]): YearModel {
  const salary = calculateSalary(plan.salary);
  const { params, exact } = taxParamsFor(plan.year);
  const taxInput = buildTaxInput(plan, salary);
  const tax = calculateTax(taxInput, params);
  const taxProvisionSuggested = ceilTo10Francs(tax.total / 12);

  const budget = plan.budget.map((item) =>
    item.autoFromTax && item.taxTag === 'taxProvision'
      ? { ...item, amount: taxProvisionSuggested, frequency: { kind: 'monthly' as const }, children: undefined }
      : item,
  );
  const taxProvisionBudgeted = sum(
    budget.filter((i) => i.taxTag === 'taxProvision').map((i) => (i.frequency.kind === 'monthly' ? i.amount : 0)),
  );

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
  if (!exact) warnings.push(`Für ${plan.year} sind keine Steuertarife hinterlegt – es werden die Tarife ${params.year} verwendet.`);
  if (taxProvisionBudgeted > 0 && taxProvisionBudgeted < taxProvisionSuggested) {
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
