# Frank – Finanzen, Budget & Steuern

Lokale Web-App für die persönliche Finanzplanung in der Schweiz:
Budget mit Sparkonto-Routing, Brutto-Netto-Lohnrechner und provisorische Steuerberechnung
für alle 26 Kantone und rund 2100 Gemeinden. Keine Cloud, kein Login – die Daten bleiben im Browser.

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
| **Übersicht** | Planjahr wechseln oder anlegen, Monats- und Jahresrest, Lohn und Spesen, Finanz-Radar, Steuervorschau und anstehende Rechnungen |
| **Budget** | Posten nach Kategorie aufklappen und bearbeiten, Ring- oder Balkengrafik, monatliche Abflüsse und Kontozuordnung |
| **Ausgaben** | Bank- und Karten-CSV importieren, Händler und Buchungen durchsuchen, Soll/Ist und Ausgabenkalender ansehen |
| **Sparen / Anlagen** | Kontoverlauf, Daueraufträge, Säule 3a und Sparziele. Über den Titel zu Depot, Wertpapieren und Anlage-CSV wechseln |
| **Mehr** | Einnahmen und Spesen bearbeiten, Steuern simulieren, Verträge prüfen, Konten verwalten und Backups erstellen |

## Soll/Ist mit Bank-Import

- Im Tab «Ausgaben» auf «CSV» tippen und den Konto- oder Kartenexport auswählen. Frank erkennt Trennzeichen,
  Kopfzeile und Spalten. In der Vorschau lassen sie sich prüfen und ändern.
- Buchungen ohne Posten einmal zuordnen, Frank merkt sich den Händler und die Kategorie der Bank
  (z. B. UBS-App: «Lebensmittel»). Konto- und Kartennummern übernimmt Frank nicht.
- iPhone: Öffnet sich der Export in Numbers, dort «Teilen» → «Exportieren» → «CSV» wählen.
- Die Datei verlässt das Gerät nicht.

## Bedienung auf dem Handy

- Tab-Leiste unten, Wischen nach links oder rechts wechselt zur nächsten Seite.
- In breiten Tabellen verschiebt Wischen die Tabelle horizontal.
- Als App installieren: in Safari «Teilen», dann «Zum Home-Bildschirm».

## iPhone-App (PWA)

- Startbildschirme für alle iPhone-Grössen ab SE (1. Gen.) bis 17 Pro Max: `public/splash/`,
  neu erzeugen mit `node scripts/generate-splash.mjs` (braucht Playwright, schreibt die Links in `index.html`).
- Vollbild mit durchscheinender Statusleiste, Safe-Areas, kein Zoom, kein Gummiband-Effekt.
- Offline: Der Service Worker speichert alle App-Dateien einer Version (`scripts/build-service-worker.mjs`).
  Kommt die App in den Vordergrund, sucht sie nach einer neuen Version und bietet «Neu laden» an.
- Haptik: auf iOS 18+ über einen unsichtbaren Systemschalter, auf Android über die Vibration API,
  sonst ohne Feedback (`src/app/haptics.ts`).
- Push-Mitteilungen gibt es bewusst nicht: Sie bräuchten einen eigenen Server mit privatem VAPID-Schlüssel,
  und Frank speichert nichts ausserhalb des Geräts.

## Kurse für Anlagen

- Gratis-Key bei [Twelve Data](https://twelvedata.com/register) oder [Alpha Vantage](https://www.alphavantage.co/support/#api-key) holen und auf der Seite «Anlagen» eintragen.
- Der Key bleibt im LocalStorage des Geräts und ist nicht im JSON-Backup.
- An den Kursdienst gehen nur Tickersymbole und Währungen, keine Stückzahlen oder Beträge.
- Gratis-Angebote haben Limits (Twelve Data: 8 Abfragen pro Minute, Alpha Vantage: 25 pro Tag). Börsen ausserhalb der USA sind teils eingeschränkt. Dann den Kurs von Hand eintragen.

## Architektur

```
src/
├─ domain/            reine Rechenlogik, ohne React (vollständig testbar)
│  ├─ money.ts        Beträge in Rappen (Ganzzahlen), Rundung auf 5 Rp.
│  ├─ types.ts        Datenmodell
│  ├─ salaryEngine.ts Lohnrechner
│  ├─ tax/            Tarif-Bausteine + Steuer-Engine (Bund, Kanton, Gemeinde)
│  ├─ budgetEngine.ts Budget, Totale, Daueraufträge
│  ├─ cashflowEngine.ts Kontoverlauf Sparkonten
│  ├─ goalsEngine.ts  Sparziele
│  └─ yearModel.ts    verbindet alles zu einem Jahresmodell
├─ params/            Steuerdaten aller Kantone und Gemeinden (generated/ erzeugt das Update-Skript)
├─ storage/           LocalStorage, JSON-Import/Export, Schema-Migrationen
├─ seed/              Demo-Daten (+ optional persönliche Startdaten, nicht versioniert)
├─ features/          Seiten der Oberfläche
└─ components/        UI-Bausteine
scripts/              update-tax-data.mjs: lädt die Steuerdaten vom ESTV-Steuerrechner
tests/                Vitest: Lohn, Budget, Steuern gegen ESTV-Vergleichswerte
```

## Steuerberechnung & Quellen

- Tarife, Abzüge und Steuerfüsse stammen aus dem [ESTV-Steuerrechner](https://swisstaxcalculator.estv.admin.ch).
  Die App ruft die ESTV nie auf. Die Daten liegen in `src/params/generated/tax-data.json`.
- Wohnort, Zivilstand, Kinder (mit Alter) und Konfession wählst du auf der Seite «Steuern».
  Verheiratete rechnen mit Familientarif, Splitting und dem Nettolohn der Partnerin oder des Partners.
- `tests/estvReference.test.ts` vergleicht die ganze Berechnung für alle 26 Kantonshauptorte
  mit dem ESTV-Detailrechner: 4 Lohnstufen für Ledige (Toleranz 1 %), dazu Alleinverdienende mit
  zwei Kindern und Doppelverdienende ohne Kinder (Toleranz 3 %).
- `tests/goldenTax.test.ts` prüft die Tarife von Aesch BL gegen frühere Vergleichswerte (±1 CHF).
- Die Berechnung ist eine **provisorische Schätzung**. Massgebend ist die Veranlagung.

### Steuerdaten aktualisieren

```bash
npm run update-tax
```

Das Skript lädt die Jahre 2023 bis nächstes Jahr. Ein Jahr übernimmt es pro Kanton erst, wenn die ESTV
es publiziert hat. Noch nicht beschlossene Steuerfüsse fehlen deshalb. Für ein fehlendes Jahr rechnet Frank
mit dem letzten verfügbaren Jahr und zeigt einen Hinweis. Danach `npm test`, committen und pushen.

Die Schnittstelle ist nicht offiziell dokumentiert. Ändert die ESTV sie, bricht das Skript mit einer Meldung ab.
Die App läuft dann mit den bisherigen Daten weiter.

### Bekannte Grenzen

- Genf, Waadt und Wallis haben Sonderregeln (Steuerreduktion, Tarifsenkung, indexierter Tarif).
  Das Skript leitet dafür Korrekturfaktoren aus dem ESTV-Rechner ab. Im Wallis weicht die Gemeindesteuer
  je nach Gemeinde einige Prozent ab, weil jede Gemeinde einen eigenen Index hat.
- Sozialabzüge für tiefe Einkommen bildet Frank nur in Luzern ab. In BE, FR, NE, OW, SZ, VD und VS
  schätzt Frank bei tiefen Einkommen eher zu hohe Steuern.
- Mieterabzug (ZG, VD): Betrag selbst erfassen, Frank begrenzt ihn auf das kantonale Maximum.
- Personalsteuer: Frank verwendet den Betrag des Kantonshauptorts.
- Familien: Rabatte nach dem Tarif (VS Familienrabatt, VD Familienquotient, BL Kinderermässigung) misst
  das Skript am Kantonshauptort. Ausbildungsabzüge für Kinder und Alleinerziehendenabzüge fehlen.
  Die Partnerin oder der Partner erhält nur die Pauschale für Berufskosten, keine Fahrkosten.

## Datenschutz

- Persönliche Zahlen gehören **nicht** ins Repository. `.gitignore` schliesst `*.local.ts`, `*.local.json` und `*.xlsx` aus.
- Optionale persönliche Startdaten: `src/seed/personal.local.ts` (exportiert `personalData()`); ohne diese Datei startet die App mit Demo-Daten.
- Backups (`frank-backup-*.json`) enthalten alle Zahlen – nicht öffentlich ablegen.

## Später geplant

- Provisorische Steuerraten prüfen (Rückstellung bis zu jedem Termin)
