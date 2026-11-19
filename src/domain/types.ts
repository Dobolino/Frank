import type { Rappen } from './money';
import type { SalaryCertificateRecord } from './salaryCertificateRecord';

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export const MONTHS: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'] as const;
export const monthName = (m: Month): string => MONTH_NAMES[m - 1] ?? String(m);

// ───────────────────────────── Konten ─────────────────────────────

export type AccountType = 'checking' | 'savings' | 'investment' | 'pillar3a';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
}

// ───────────────────────────── Lohn ─────────────────────────────

/** Sozialabzüge als Anteil (0.053 = 5.3 %). */
export interface SocialRates {
  ahv: number;
  alv: number;
  nbuv: number;
  ktg: number;
}

export interface SalaryChange {
  fromMonth: Month;
  grossMonthly: Rappen;
}

/** Auszahlung des 13. Monatslohns: Anteil eines Monatslohns oder fixer Betrag. */
export interface ThirteenthPayout {
  month: Month;
  share?: number;
  amount?: Rappen;
}

export interface Bonus {
  month: Month;
  gross: Rappen;
}

/**
 * Pauschalspesen pro Monat: werden mit dem Lohn ausbezahlt, sind aber kein Lohn
 * (keine AHV/ALV/BVG-Abzüge). Effektive Spesen-Rückerstattungen gehören nicht hierher.
 */
export interface ExpenseAllowance {
  monthly: Rappen;
  /** false, wenn das Spesenreglement vom Kanton genehmigt ist (dann steuerfrei). */
  taxable: boolean;
}

export interface SalaryInput {
  grossMonthly: Rappen;
  expenseAllowance?: ExpenseAllowance;
  changes: SalaryChange[];
  thirteenth: ThirteenthPayout[];
  bonuses: Bonus[];
  rates: SocialRates;
  bvgMonthly: Rappen;
}

// ───────────────────────────── Budget ─────────────────────────────

export type BudgetCategory = 'fixed' | 'household' | 'personal' | 'mobility' | 'savings';

export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  fixed: 'Fixkosten',
  household: 'Haushalt',
  personal: 'Persönliches',
  mobility: 'Mobilität',
  savings: 'Sparen & Vorsorge',
};

export type Frequency =
  | { kind: 'monthly' }
  | { kind: 'yearly'; month: Month }
  | { kind: 'quarterly'; months: Month[] }
  | { kind: 'custom'; months: Month[] };

/** Steuerliche Bedeutung eines Postens, damit die Steuer-Engine ihn findet. */
export type TaxTag = 'insurance' | 'pillar3a' | 'taxProvision';

export interface BudgetSubItem {
  id: string;
  name: string;
  amount: Rappen;
}

export interface BudgetItem {
  id: string;
  category: BudgetCategory;
  name: string;
  /** Betrag pro Fälligkeit (bei monatlich: pro Monat, bei jährlich: Jahresrechnung). */
  amount: Rappen;
  frequency: Frequency;
  /** Konto, von dem bezahlt wird. Ein Sparkonto erzeugt einen Dauerauftrag. */
  accountId?: string;
  /** Aufgliederung, z. B. Streaming-Abos. Ist sie vorhanden, ist amount die Summe. */
  children?: BudgetSubItem[];
  taxTag?: TaxTag;
  /** Steuerrückstellung automatisch aus der Steuer-Engine übernehmen. */
  autoFromTax?: boolean;
  goalId?: string;
  note?: string;
}

// ───────────────────────────── Einkommen & Steuern ─────────────────────────────

export type OtherIncomeKind = 'dividend' | 'interest' | 'sideJob' | 'other';

export interface OtherIncome {
  id: string;
  name: string;
  kind: OtherIncomeKind;
  /** Jahresbetrag brutto (Dividenden vor Verrechnungssteuer). */
  amount: Rappen;
  month?: Month;
}

export type MealDeduction = 'none' | 'full' | 'reduced';

export type CommuteMode = 'none' | 'bike' | 'publicTransport' | 'car';

export const COMMUTE_LABELS: Record<CommuteMode, string> = {
  none: 'Keine Kosten (zu Fuss / Homeoffice)',
  bike: 'Velo',
  publicTransport: 'Öffentlicher Verkehr',
  car: 'Auto',
};

export interface TaxProfile {
  commuteMode: CommuteMode;
  /** Fahrkosten pro Jahr (Velo: in BL Pauschale bis CHF 700, ÖV: Abo-Preis). */
  commuteCosts: Rappen;
  meal: MealDeduction;
  /** Weitere Abzüge (Weiterbildung, Spenden, Schuldzinsen …). */
  otherDeductions: Rappen;
  /** Mieterabzug für die Kantonssteuer (nur ZG und VD). */
  rentDeduction?: Rappen;
  /** Depotwert (Seite «Anlagen») zum Vermögen zählen. */
  includeDepot?: boolean;
  /** Verheiratet: Nettolohn der Partnerin oder des Partners pro Jahr (Lohnausweis). */
  partnerNet?: Rappen;
  /** KTG-Beiträge im Lohnausweis unter den Sozialabzügen (Ziffer 9). */
  ktgDeductible: boolean;
  /** Steuerbares Reinvermögen am 31.12. (ohne Säule 3a / Pensionskasse). */
  wealth: Rappen;
  /** Versicherungsprämien pro Jahr, falls nicht aus dem Budget abgeleitet. */
  insurancePremiumsOverride?: Rappen;
}

export interface ActualTax {
  federal?: Rappen;
  cantonMunicipal?: Rappen;
  note?: string;
}

/** Verteilung von 13. Lohn und Bonus auf Konten oder Sparziele. */
export interface ExtrasAllocation {
  id: string;
  share: number;
  accountId?: string;
  goalId?: string;
}

export interface YearPlan {
  year: number;
  /** Geprüfte Jahreswerte des Lohnausweises zum Vergleich mit dem Lohnplan. */
  salaryCertificate?: SalaryCertificateRecord;
  salary: SalaryInput;
  otherIncome: OtherIncome[];
  budget: BudgetItem[];
  tax: TaxProfile;
  actualTax?: ActualTax;
  extrasAllocation: ExtrasAllocation[];
  /** Kontostände am 1. Januar, für den Cashflow-Kalender. */
  startBalances: Record<string, Rappen>;
  note?: string;
}

// ───────────────────────────── Ziele & App ─────────────────────────────

export interface SavingsGoal {
  id: string;
  name: string;
  target: Rappen;
  saved: Rappen;
  /** Zieldatum im Format YYYY-MM. */
  dueDate: string;
  accountId?: string;
  emoji?: string;
}

export interface Profile {
  /** BFS-Gemeindenummer des Wohnorts (bestimmt Kanton und Steuerfüsse). */
  bfsId?: number;
  /** Name der Gemeinde, wie ihn die ESTV führt. */
  municipality: string;
  /** Kantonskürzel, z. B. «ZH». */
  canton: string;
  civilStatus: 'single' | 'married';
  /** Alter der Kinder mit Kinderabzug (in Jahren). */
  children?: number[];
  /** Konfession für die Kirchensteuer. */
  church: 'none' | 'protestant' | 'roman' | 'christ';
}

/** Einstellungen des Finanz-Radars auf der Übersicht. */
export interface RadarSettings {
  accountId?: string;
  /** Tatsächlicher Kontostand zu Beginn von `asOfYm`. */
  balance?: Rappen;
  asOfYm?: string;
  /** Unter diesem Stand wird die Ampel gelb. */
  buffer: Rappen;
}

// ───────────────────────────── Anlagen ─────────────────────────────

/** Letzter bekannter Kurs einer Position. */
export interface Quote {
  /** Kurs in der Handelswährung der Position. */
  price: number;
  /** Veränderung zum Vortag in Prozent. */
  changePct?: number;
  /** Zeitpunkt des Kurses (ISO). */
  asOf: string;
}

/** Eine Aktie, ein ETF oder ein Fonds im Depot. */
export interface Holding {
  id: string;
  /** Tickersymbol beim Kursdienst, z. B. «AAPL» oder «NESN». */
  symbol: string;
  /** Börse (z. B. «SIX»), falls der Kursdienst sie braucht. */
  exchange?: string;
  name: string;
  /** Handelswährung, z. B. CHF, USD, EUR, GBX (Pence). */
  currency: string;
  quantity: number;
  /** Einstandswert total in CHF (optional, für Gewinn/Verlust). */
  costChf?: Rappen;
  /** Von Hand gesetzter Kurs, falls kein Kursdienst eingerichtet ist. */
  manualPrice?: number;
  quote?: Quote;
}

export interface Investments {
  holdings: Holding[];
  /** Wechselkurse zu CHF: 1 Einheit Fremdwährung = rate CHF. */
  fx: Record<string, { rate: number; asOf: string }>;
}

/** Vermögensstand zu einem Monat (Rappen). */
export interface WealthSnapshot {
  /** YYYY-MM */
  month: string;
  /** Bank- und Sparkonten. */
  accounts: Rappen;
  depot: Rappen;
  pillar3a: Rappen;
}

/** Herkunft von Bank-, Karten- oder Depotbuchungen. */
export interface ImportAccount {
  id: string;
  bankId: string;
  name: string;
  type: 'bank' | 'card' | 'depot';
  /** Display hint for the account, never its full number. */
  lastFour?: string;
}

/** Buchung aus dem Bank-Import. */
export interface Transaction {
  id: string;
  accountId?: string;
  /** Local HMAC of the statement source, independent of its grouping in the UI. */
  sourceFingerprint?: string;
  /** Counterparty from a payment export, used locally to suggest matching transfers. */
  counterparty?: string;
  /** Reciprocal booking ID, set only after the user confirms an own-account transfer. */
  transferPeerId?: string;
  excludedFromSpend?: boolean;
  merchantId?: string;
  /** YYYY-MM-DD */
  date: string;
  text: string;
  /** Negativ = Ausgabe, positiv = Eingang. */
  amount: Rappen;
  /** Name des Budgetpostens (über Jahre stabil, IDs sind es nicht). */
  item?: string;
  /** Kategorie der Bank, falls im Export enthalten. */
  category?: string;
}

/** Zuordnungsregel: Buchungstext enthält `match` → Budgetposten `item`. */
export interface CategoryRule {
  match: string;
  item: string;
  /** «category»: Regel gilt für die Bank-Kategorie (genauer Name), sonst für den Buchungstext. */
  field?: 'category';
}

export interface AppData {
  schemaVersion: number;
  profile: Profile;
  settings?: { radar?: RadarSettings };
  investments?: Investments;
  /** Vermögensstände über die Zeit, ein Eintrag pro Monat. */
  wealthHistory?: WealthSnapshot[];
  /** Importierte Bankbuchungen für den Soll/Ist-Vergleich. */
  transactions?: Transaction[];
  importAccounts?: ImportAccount[];
  /** Geräteeigene HMAC-Zuordnung der CSV-Quellen, über Backups übertragbar. */
  accountRecognition?: { key: string; bindings: Record<string, string> };
  customMerchants?: { id: string; name: string; logo?: string }[];
  merchantRules?: { match: string; merchantId: string }[];
  investmentTransactions?: import('./investCsv').InvestmentTransaction[];
  /** Zuordnungsregeln für den Bank-Import. */
  rules?: CategoryRule[];
  accounts: Account[];
  years: Record<string, YearPlan>;
  goals: SavingsGoal[];
  activeYear: number;
}

export const SCHEMA_VERSION = 2;
