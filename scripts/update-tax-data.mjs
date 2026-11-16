#!/usr/bin/env node
/**
 * Lädt Steuerfüsse, Tarife und Abzüge aller Kantone und Gemeinden vom ESTV-Steuerrechner
 * und speichert sie als JSON im Repository. Die App selbst ruft die ESTV nie auf.
 *
 *   npm run update-tax                 Jahre: 2023 bis nächstes Jahr
 *   npm run update-tax -- 2026 2027    nur diese Jahre
 *   npm run update-tax -- --no-reference   ohne Vergleichswerte für die Tests
 *
 * Ein Jahr wird pro Kanton nur übernommen, wenn die ESTV es bereits publiziert hat.
 * Noch nicht beschlossene Steuerfüsse fehlen deshalb in der Datei.
 *
 * Quelle: https://swisstaxcalculator.estv.admin.ch (Schnittstelle der Website, nicht offiziell dokumentiert).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Gleicher Tarif-Baustein wie in der App (Node ≥ 22.18 liest TypeScript direkt)
import { applyScale } from '../src/domain/tax/scales.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = resolve(ROOT, 'src/params/generated/tax-data.json');
const REFERENCE_FILE = resolve(ROOT, 'tests/fixtures/estv-reference.json');
const API = 'https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV';

const GROUP_ALL_LOCATIONS = 99;
const GROUP_CAPITALS = 88;
const CALCULATOR_INCOME_WEALTH = 1;
const SINGLE = 1;
const NO_CONFESSION = 5;
const EMPLOYED = 1;

// ───────────────────────────── Aufruf ─────────────────────────────

const args = process.argv.slice(2);
const withReference = !args.includes('--no-reference');
const thisYear = new Date().getFullYear();
const requestedYears = args.filter((a) => /^\d{4}$/.test(a)).map(Number);
const years = requestedYears.length > 0 ? requestedYears : range(2023, thisYear + 1);

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(operation, body, attempt = 1) {
  try {
    const res = await fetch(`${API}/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${operation}: HTTP ${res.status}`);
    const json = await res.json();
    if (!('response' in json)) throw new Error(`${operation}: unerwartete Antwort`);
    return json.response;
  } catch (e) {
    if (attempt >= 4) throw e;
    await sleep(1000 * 2 ** attempt);
    return call(operation, body, attempt + 1);
  }
}

// ───────────────────────────── Tarife ─────────────────────────────

const SINGLE_GROUP_PREFERENCE = [
  (g) => g.split(',').includes('LEDIG_OHNE_KINDER'),
  (g) => g === 'ALLE',
  (g) => g.split(',').includes('LEDIG_ALLEINE'),
];

/** Wählt die Tariftabelle für ledige Personen ohne Kinder. */
function pickSingle(entries) {
  for (const test of SINGLE_GROUP_PREFERENCE) {
    const hit = entries.find((e) => test(e.Group));
    if (hit) return hit;
  }
  return null;
}

const num = String.raw`(-?\d+(?:\.\d+)?)`;
const W = String.raw`\s*\$wert\$\s*`;
const FORMULA_PATTERNS = [
  {
    // b·x + c·x·(ln x − 1) + d
    re: new RegExp(String.raw`^\s*${num}\s*\*${W}\+\s*${num}\s*\*${W}\*\s*\(\s*log${W}-\s*1\s*\)\s*\+\s*\(?\s*${num}\s*\)?\s*$`),
    map: (m) => ({ kind: 'log', b: +m[1], c: +m[2], d: +m[3] }),
  },
  {
    // base + rate·(x − from)
    re: new RegExp(String.raw`^\s*${num}\s*\+\s*${num}\s*\*\s*\(${W}-\s*${num}\s*\)\s*$`),
    map: (m) => ({ kind: 'linear', base: +m[1], rate: +m[2], offset: +m[3] }),
  },
  {
    // p·x / 100
    re: new RegExp(String.raw`^\s*${num}\s*\*${W}\/\s*100\s*$`),
    map: (m) => ({ kind: 'linear', base: 0, rate: +m[1] / 100, offset: 0 }),
  },
];

function parseFormula(text) {
  for (const p of FORMULA_PATTERNS) {
    const m = text.match(p.re);
    if (m) return p.map(m);
  }
  throw new Error(`Unbekannte Tarif-Formel: «${text}». Skript erweitern.`);
}

/** Rundungsartefakte wie 2.9699999999999998 entfernen. */
const clean = (x) => Math.round(x * 1e6) / 1e6;

const KNOWN_TABLES = new Set(['BUND', 'ZUERICH', 'FREIBURG', 'FLATTAX', 'FORMEL']);

function toScale(entry) {
  if (!KNOWN_TABLES.has(entry.TableType)) throw new Error(`Unbekannter Tariftyp ${entry.TableType}`);
  if (entry.TableType === 'FORMEL') {
    return {
      type: 'FORMEL',
      segments: entry.Table.filter((t) => t.Formula).map((t) => ({ from: t.Amount, ...parseFormula(t.Formula) })),
    };
  }
  return { type: entry.TableType, rows: entry.Table.map((t) => [t.Amount, clean(t.Percent), clean(t.Taxes)]) };
}

function extractScales(scales) {
  const federal = pickSingle(scales.filter((s) => s.Target === 'BUND' && s.TaxType === 'EINKOMMENSSTEUER'));
  const cantons = {};
  for (const canton of new Set(scales.map((s) => s.Location.Canton))) {
    const own = scales.filter((s) => s.Location.Canton === canton && s.Target === 'KANTON');
    const income = pickSingle(own.filter((s) => s.TaxType === 'EINKOMMENSSTEUER'));
    const wealth = pickSingle(own.filter((s) => s.TaxType === 'VERMOEGENSSTEUER'));
    if (!income) throw new Error(`${canton}: kein Einkommenssteuertarif für Ledige gefunden`);
    cantons[canton] = { income: toScale(income), wealth: wealth ? toScale(wealth) : null };
  }
  return { federal: federal ? toScale(federal) : null, cantons };
}

// ───────────────────────────── Abzüge ─────────────────────────────

/** Abzüge für eine ledige, unselbständig erwerbstätige Person ohne Kinder mit Pensionskasse. */
function extractDeductions(table) {
  const byId = Object.fromEntries(table.map((t) => [t.Name.ID.replace(/_(EK|VM)$/, ''), t]));
  const max = (id) => (byId[id] ? byId[id].Maximum : undefined);
  const amount = (id) => (byId[id] ? byId[id].Amount : undefined);

  // Übrige Berufskosten: Grundbetrag + Prozent vom Nettolohn, begrenzt durch Minimum und Maximum
  const pro = byId.HauptErw;
  let otherPro = null;
  if (pro) {
    const f = pro.Format.split(',');
    otherPro = f.includes('PERCENT')
      ? {
          base: f.includes('STANDARDIZED') ? pro.Amount : 0,
          percent: pro.Percent,
          min: f.includes('MINIMUM') ? pro.Minimum : 0,
          max: f.includes('MAXIMUM') ? pro.Maximum : null,
        }
      : { base: f.includes('MAXIMUM') ? pro.Maximum : pro.Amount, percent: 0, min: 0, max: null };
  }

  // Versicherungsprämien und Sparzinsen: je nach Kanton ein Gesamtabzug oder mehrere Teilabzüge.
  const insuranceParts = [
    ['KKSparLedigMitBVGS3a'],
    ['PrivVersSparLedigMitBVGS3a', 'KKDurchschnittsprämieErw'],
    ['KKPrivVersLedig', 'SparzinsenLedig'],
    ['KKLedig', 'PrivVersLedig', 'SparzinsenLedig'],
  ].find((ids) => byId[ids[0]]);
  const insuranceMax = insuranceParts ? insuranceParts.reduce((s, id) => s + (max(id) ?? 0), 0) : null;

  // Sozialabzüge für Ledige. «Zusätzlicher Sozialabzug» gilt nur, wo es keinen Ledigenabzug gibt (OW).
  const personal = [];
  for (const [id, label] of [
    ['SozLedig', 'Abzug für ledige Personen'],
    ['SozAlleinEigenemHaushalt', 'Abzug für Alleinstehende'],
    ...(byId.SozLedig ? [] : [['SozZusAbzug', 'Sozialabzug']]),
  ]) {
    const value = amount(id);
    if (value) personal.push({ id, label, amount: value });
  }

  // Entlastung tiefer Einkommen (LU): Prozent der Differenz zur Schwelle
  const lowIncome =
    byId.SozBeschEK?.Format === 'PERCENT' && byId.EntlAlleinstehendeSchwellwert
      ? { threshold: byId.EntlAlleinstehendeSchwellwert.Amount, percent: byId.SozBeschEK.Percent }
      : null;

  return {
    commuteMax: max('Fahrkosten') ?? null,
    otherPro,
    mealFull: max('VerpflOhneVerb') ?? 0,
    mealReduced: max('VerpflMitVerb') ?? 0,
    pillar3aMax: max('S3aMax_mitVorsorge') ?? 0,
    insuranceMax,
    personal,
    lowIncome,
    /** Mieterabzug (ZG, VD): Maximum, Betrag gibt die Person selbst ein. */
    rentMax: max('MaxAbzMiete') ?? null,
  };
}

function extractWealthAllowance(table) {
  const byId = Object.fromEntries(table.map((t) => [t.Name.ID.replace(/_VM$/, ''), t]));
  const hit = byId.SozLedigOhneKinder ?? byId.SozLedigMitOhneKinder;
  return hit ? hit.Amount : 0;
}

function extractAllDeductions(rows) {
  const fedRow = rows.find((r) => r.Target === 'BUND' && r.TaxType === 'EINKOMMENSSTEUER');
  const cantons = {};
  for (const r of rows) {
    if (r.Target !== 'KANTON') continue;
    const c = (cantons[r.Location.Canton] ??= {});
    if (r.TaxType === 'EINKOMMENSSTEUER') Object.assign(c, extractDeductions(r.Table));
    if (r.TaxType === 'VERMOEGENSSTEUER') c.wealthAllowance = extractWealthAllowance(r.Table);
  }
  return { federal: fedRow ? extractDeductions(fedRow.Table) : null, cantons };
}

// ───────────────────────────── Steuerfüsse ─────────────────────────────

function compactRates(r) {
  const income = [r.IncomeRateCanton, r.IncomeRateCity, r.IncomeRateProtestant, r.IncomeRateRoman, r.IncomeRateChrist];
  const wealth = [r.FortuneRateCanton, r.FortuneRateCity, r.FortuneRateProtestant, r.FortuneRateRoman, r.FortuneRateChrist];
  const round = (x) => Math.round(x * 1000) / 1000;
  const same = income.every((v, i) => v === wealth[i]);
  return same ? income.map(round) : [...income, ...wealth].map(round);
}

// ───────────────────────────── Vergleichswerte ─────────────────────────────

const REFERENCE_CASES = [
  { gross: 45_000, fortune: 30_000 },
  { gross: 85_000, fortune: 250_000 },
  { gross: 150_000, fortune: 60_000 },
  { gross: 300_000, fortune: 1_500_000 },
];

async function buildReference(year, capitals) {
  const out = [];
  for (const loc of capitals) {
    for (const c of REFERENCE_CASES) {
      const r = await call('API_calculateDetailedTaxes', {
        SimKey: null,
        TaxYear: year,
        TaxLocationID: loc.TaxLocationID,
        Relationship: SINGLE,
        Confession1: NO_CONFESSION,
        Children: [],
        Age1: 35,
        RevenueType1: EMPLOYED,
        Revenue1: c.gross,
        Fortune: c.fortune,
        Language: 1,
        Confession2: 0,
        Age2: 0,
        RevenueType2: 0,
        Revenue2: 0,
      });
      const net = r.InfoBoth.find((i) => i.Entry.ID === 'TXT_1');
      out.push({
        year,
        canton: loc.Canton,
        bfsId: loc.BfsID,
        city: loc.City,
        gross: c.gross,
        fortune: c.fortune,
        netWage: net ? net.Fed : null,
        taxableIncomeFed: r.TaxableIncomeFed,
        taxableIncomeCanton: r.TaxableIncomeCanton,
        taxableFortune: r.TaxableFortuneCanton,
        incomeTaxFed: r.IncomeTaxFed,
        incomeTaxCanton: r.IncomeTaxCanton,
        incomeTaxCity: r.IncomeTaxCity,
        fortuneTaxCanton: r.FortuneTaxCanton,
        fortuneTaxCity: r.FortuneTaxCity,
        personalTax: r.PersonalTax,
        taxCredit: r.TaxCredit,
        deductions: r.InfoBoth.filter((i) => i.Fed < 0 || i.Canton < 0).map((i) => ({
          id: i.Entry.ID,
          label: i.Entry.DE,
          fed: i.Fed,
          canton: i.Canton,
        })),
      });
      await sleep(150);
    }
  }
  return out;
}

// ───────────────────────────── Kalibrierung ─────────────────────────────

/**
 * Einige Kantone haben Regeln, die nicht in den Tarif-Exporten stehen (z. B. GE: Steuerreduktion,
 * VD: Tarifsenkung, VS: indexierter Tarif). Das Skript rechnet deshalb pro Kanton drei Fälle
 * mit dem ESTV-Rechner und leitet daraus Korrekturfaktoren ab.
 */
const CALIBRATION_INCOMES = [30_000, 80_000, 200_000];
const CALIBRATION_FORTUNE = 600_000;
const TOLERANCE = 0.004;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs) => (Math.max(...xs) - Math.min(...xs)) / Math.abs(mean(xs) || 1);
const round4 = (x) => Math.round(x * 10_000) / 10_000;

/** Divisor k, damit k · Tarif(x / k) dem ESTV-Wert entspricht (Wallis: indexierter Tarif). */
function fitDivisor(scale, income, target) {
  let lo = 0.5;
  let hi = 4;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    const tax = k * applyScale(scale, income / k);
    if (tax > target) lo = k;
    else hi = k;
  }
  return (lo + hi) / 2;
}

const CITY_CURVE_INCOMES = [15_000, 30_000, 50_000, 80_000, 120_000, 200_000, 350_000, 600_000, 1_000_000];

function simpleTaxes(year, loc, income, fortune) {
  return call('API_calculateSimpleTaxes', {
    SimKey: null,
    TaxYear: year,
    TaxLocationID: loc.TaxLocationID,
    Relationship: SINGLE,
    Confession1: NO_CONFESSION,
    Children: [],
    Confession2: 0,
    TaxableIncomeCanton: income,
    TaxableIncomeFed: 0,
    TaxableFortune: fortune,
  });
}

async function calibrate(year, loc, canton, rate) {
  const runs = [];
  for (const income of CALIBRATION_INCOMES) {
    runs.push({ income, r: await simpleTaxes(year, loc, income, CALIBRATION_FORTUNE) });
    await sleep(120);
  }
  const [incCanton, incCity] = rate;
  const [wCanton, wCity] = rate.length > 5 ? [rate[5], rate[6]] : [rate[0], rate[1]];
  const cal = {};
  const notes = [];

  // Tarif prüfen, sonst Divisor anpassen
  const simpleRatios = runs.map(({ income, r }) => r.IncomeSimpleTaxCanton / (applyScale(canton.income, income) || 1));
  if (simpleRatios.some((x) => Math.abs(x - 1) > TOLERANCE)) {
    const mid = runs[1];
    const k = fitDivisor(canton.income, mid.income, mid.r.IncomeSimpleTaxCanton);
    const check = runs.map(({ income, r }) => (k * applyScale(canton.income, income / k)) / (r.IncomeSimpleTaxCanton || 1));
    cal.divisor = round4(k);
    if (check.some((x) => Math.abs(x - 1) > TOLERANCE)) notes.push('Einkommenstarif');
  }

  const factor = (key, values) => {
    const valid = values.filter((v) => Number.isFinite(v) && v > 0);
    if (valid.length === 0) return;
    const m = mean(valid);
    if (Math.abs(m - 1) > TOLERANCE / 2) cal[key] = round4(m);
    if (spread(valid) > TOLERANCE) notes.push(key);
  };
  factor('cantonFactor', runs.map(({ r }) => r.IncomeTaxCanton / ((r.IncomeSimpleTaxCanton * incCanton) / 100)));
  const cityRatios = runs.map(({ r }) => r.IncomeTaxCity / ((r.IncomeSimpleTaxCanton * incCity) / 100));
  if (spread(cityRatios) > TOLERANCE && incCity > 0) {
    // Gemeinde mit eigenem Index (VS): Verhältnis zur Kantonssteuer je Einkommen messen und dazwischen interpolieren
    const curve = [];
    for (const income of CITY_CURVE_INCOMES) {
      const r = await simpleTaxes(year, loc, income, 0);
      if (r.IncomeSimpleTaxCanton > 0) curve.push([income, round4(r.IncomeTaxCity / ((r.IncomeSimpleTaxCanton * incCity) / 100))]);
      await sleep(120);
    }
    cal.cityCurve = curve;
    notes.push('Gemeindetarif');
  } else {
    factor('cityFactor', cityRatios);
  }

  const w = runs[0].r;
  if (canton.wealth) {
    const ours = applyScale(canton.wealth, CALIBRATION_FORTUNE);
    if (Math.abs(w.FortuneSimpleTaxCanton / (ours || 1) - 1) > TOLERANCE) notes.push('Vermögenstarif');
  }
  factor('wealthCantonFactor', [w.FortuneTaxCanton / ((w.FortuneSimpleTaxCanton * wCanton) / 100)]);
  factor('wealthCityFactor', [w.FortuneTaxCity / ((w.FortuneSimpleTaxCanton * wCity) / 100)]);
  if (w.PersonalTax > 0) cal.personalTax = w.PersonalTax;
  if (notes.length > 0) cal.approximate = [...new Set(notes)];
  return cal;
}

// ───────────────────────────── Ablauf ─────────────────────────────

async function main() {
  console.log(`ESTV-Steuerdaten für ${years.join(', ')} …`);
  const ranges = await call('API_getTaxYearRangeCanton', {});
  const maxYear = Object.fromEntries(
    ranges
      .filter((r) => r.Calculator === CALCULATOR_INCOME_WEALTH && r.Canton !== 'CH')
      .map((r) => [r.Canton, r.MaxYear]),
  );

  const data = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'ESTV Steuerrechner (swisstaxcalculator.estv.admin.ch)',
    years: [],
    municipalities: {},
    federal: {},
    cantons: {},
    rates: {},
  };
  const reference = [];

  for (const year of years) {
    const cantonsWithYear = Object.keys(maxYear).filter((c) => maxYear[c] >= year);
    if (cantonsWithYear.length === 0) {
      console.log(`  ${year}: noch keine Daten publiziert – übersprungen`);
      continue;
    }
    const body = { SimKey: null, TaxYear: year };
    const [rates, scales, deductions] = await Promise.all([
      call('API_exportManySimpleRates', { ...body, TaxGroupID: GROUP_ALL_LOCATIONS }),
      call('API_exportManyTaxScales', { ...body, TaxGroupID: GROUP_CAPITALS }),
      call('API_exportManyDeductions', { ...body, TaxGroupID: GROUP_CAPITALS }),
    ]);

    const s = extractScales(scales);
    const d = extractAllDeductions(deductions);
    if (!s.federal || !d.federal) throw new Error(`${year}: Bundessteuer fehlt`);
    data.federal[year] = { income: s.federal, deductions: d.federal };

    for (const canton of cantonsWithYear) {
      if (!s.cantons[canton] || !d.cantons[canton]) {
        console.warn(`  ${year} ${canton}: Tarif oder Abzüge fehlen – übersprungen`);
        continue;
      }
      (data.cantons[canton] ??= {})[year] = { ...s.cantons[canton], deductions: d.cantons[canton] };
    }

    const yearRates = {};
    for (const r of rates) {
      const loc = r.Location;
      if (!data.cantons[loc.Canton]?.[year]) continue;
      data.municipalities[loc.BfsID] = [loc.BfsName || loc.City, loc.Canton];
      yearRates[loc.BfsID] = compactRates(r);
    }
    data.rates[year] = yearRates;
    data.years.push(year);
    console.log(`  ${year}: ${Object.keys(yearRates).length} Gemeinden, ${cantonsWithYear.length} Kantone`);

    const capitals = [];
    const seen = new Set();
    for (const sc of scales) {
      if (sc.Target === 'KANTON' && !seen.has(sc.Location.Canton) && data.cantons[sc.Location.Canton]?.[year]) {
        seen.add(sc.Location.Canton);
        capitals.push(sc.Location);
      }
    }
    for (const loc of capitals) {
      const entry = data.cantons[loc.Canton][year];
      const cal = await calibrate(year, loc, entry, yearRates[loc.BfsID]);
      if (Object.keys(cal).length > 0) {
        entry.calibration = cal;
        console.log(`  ${year} ${loc.Canton}: ${JSON.stringify(cal)}`);
      }
    }

    if (withReference && year === Math.min(thisYear, Math.max(...years))) {
      console.log(`  ${year}: Vergleichswerte für ${capitals.length} Kantonshauptorte …`);
      reference.push(...(await buildReference(year, capitals)));
    }
  }

  if (data.years.length === 0) throw new Error('Keine Daten erhalten.');
  await mkdir(dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data) + '\n');
  console.log(`Gespeichert: ${DATA_FILE}`);
  if (reference.length > 0) {
    await mkdir(dirname(REFERENCE_FILE), { recursive: true });
    await writeFile(REFERENCE_FILE, JSON.stringify(reference, null, 1) + '\n');
    console.log(`Gespeichert: ${REFERENCE_FILE} (${reference.length} Fälle)`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
