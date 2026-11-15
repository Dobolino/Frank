# Frank – Finanzen, Budget & Steuern (Aesch BL)

Lokale Web-App für die persönliche Finanzplanung in der Schweiz:
Budget mit Sparkonto-Routing, Brutto-Netto-Lohnrechner und provisorische Steuerberechnung
(Bund, Kanton Basel-Landschaft, Gemeinde Aesch). Keine Cloud, kein Login – die Daten bleiben im Browser.

## Starten

```bash
npm install
npm run dev        # Adresse steht in der Konsole (Standard: http://localhost:5173)
npm test           # Rechen-Engines inkl. Vergleich mit dem ESTV-Steuerrechner
npm run build      # Produktions-Build nach dist/
```

## Funktionen

| Bereich | Was es macht |
|---|---|
| **Übersicht** | Netto, Ausgaben, Rest pro Monat, Jahresüberschuss, Sparquote, Steuern, Daueraufträge |
| **Budget** | Posten mit Häufigkeit (monatlich, quartalsweise, jährlich, bestimmte Monate), Konto-Zuordnung, Unterposten (z. B. Streaming-Abos), Steuer-Markierung |
| **Lohn** | Brutto → Netto mit AHV/ALV/NBUV/KTG, BVG, 13. Lohn (Juni/Dezember), Bonus, Lohnerhöhungen unter dem Jahr, Lohnausweis-Werte |
| **Steuern** | Bund + Staatssteuer BL + Gemeinde Aesch (56 %), Vermögenssteuer, Abzüge, Grenzsteuersatz, Szenario-Simulator, Vergleich mit Veranlagung |
| **Sparkonto** | Dauerauftrag pro Sparkonto (z. B. YUH) und Kontoverlauf Monat für Monat inkl. Jahresrechnungen |
| **Sparziele** | Reisen & Co. mit nötiger Monatsrate, Prognose und Übernahme ins Budget |
| **Jahresvergleich** | Lohn, Steuern, Sparen über mehrere Jahre |
| **Daten & KI** | JSON-Backup (Export/Import) und anonymisierte Zusammenfassung zum Einfügen in einen KI-Assistenten |

## Architektur

```
src/
├─ domain/            reine Rechenlogik, ohne React (vollständig testbar)
│  ├─ money.ts        Beträge in Rappen (Ganzzahlen), Rundung auf 5 Rp.
│  ├─ types.ts        Datenmodell
│  ├─ salaryEngine.ts Lohnrechner
│  ├─ tax/            Tarif-Bausteine + Steuer-Engine (Bund, BL, Gemeinde)
│  ├─ budgetEngine.ts Budget, Totale, Daueraufträge
│  ├─ cashflowEngine.ts Kontoverlauf Sparkonten
│  ├─ goalsEngine.ts  Sparziele
│  └─ yearModel.ts    verbindet alles zu einem Jahresmodell
├─ params/            Steuertarife & Abzüge pro Jahr (Daten, keine Logik)
├─ storage/           LocalStorage, JSON-Import/Export, Schema-Migrationen
├─ seed/              Demo-Daten (+ optional persönliche Startdaten, nicht versioniert)
├─ features/          Seiten der Oberfläche
└─ components/        UI-Bausteine
tests/                Vitest: Lohn, Budget, Steuern gegen ESTV-Vergleichswerte
```

## Steuerberechnung & Quellen

- Tarife und Abzüge 2023–2026 stammen aus dem Export des offiziellen
  [ESTV-Steuerrechners](https://swisstaxcalculator.estv.admin.ch) und dem ESTV-Kantonsblatt BL (Stand Feb. 2026).
- `tests/goldenTax.test.ts` vergleicht die Engine mit Werten aus dem ESTV-Rechner (Toleranz ±1 CHF).
- Die Berechnung ist eine **provisorische Schätzung** (ledig, ohne Kinder, ohne Konfession). Massgebend ist die Veranlagung.

**Neues Steuerjahr:** in `src/params/taxParams.ts` einen Block kopieren, Werte aktualisieren,
Vergleichswerte in `tests/goldenTax.test.ts` ergänzen, `npm test`.

## Datenschutz

- Persönliche Zahlen gehören **nicht** ins Repository. `.gitignore` schliesst `*.local.ts`, `*.local.json` und `*.xlsx` aus.
- Optionale persönliche Startdaten: `src/seed/personal.local.ts` (exportiert `personalData()`); ohne diese Datei startet die App mit Demo-Daten.
- Backups (`frank-backup-*.json`) enthalten alle Zahlen – nicht öffentlich ablegen.

## Später geplant

- CSV-Import aus Buddy (Soll/Ist-Vergleich) als eigenes Modul unter `src/importers/`
- Kirchensteuer und weitere Gemeinden über `params/`
