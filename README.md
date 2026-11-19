# Frank – Finanzen, Budget & Steuern

Lokale Web-App für die persönliche Finanzplanung in der Schweiz:
Budget mit Sparkonto-Routing, Brutto-Netto-Lohnrechner und provisorische Steuerberechnung
für alle 26 Kantone und rund 2100 Gemeinden. Die Daten liegen im Browser. Ein zweites Gerät lässt sich auf Wunsch direkt koppeln.

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
- Unter «Ausgaben → Umbuchungen» lassen sich passende Gegenbuchungen zweier eigener Bankkonten prüfen. Die Vorschläge berücksichtigen Buchungstag, CHF-Betrag und Hinweise zur Gegenpartei. Nach dem Bestätigen bleiben beide Buchungen auf ihrem Konto sichtbar und sind aus den Einnahmen und Ausgaben ausgeklammert. Die Verknüpfung lässt sich dort wieder lösen.
- Mit «Diesen Monat» öffnest du den laufenden Kalendermonat. Das Auge blendet Beträge und Prozentwerte aus. Farben, Balken, Geldfluss und Kalender bleiben sichtbar.
- Yuh-Aktivitäten werden einem benannten Konto zugeordnet. Der Auszug unterscheidet Belastungs- und Gutschriftswährung. Frank übernimmt die ausgewiesene CHF-Seite. Abgelehnte Aufträge, Aktivitäten ohne Geldbetrag und reine Fremdwährungsbuchungen erscheinen in der Importvorschau als übersprungen.
- Die Datei verlässt das Gerät nicht.

### Automatische Kontozuordnung

Die CSV-Vorschau zeigt für jede erkennbare Quelle das Konto und das Bild der Bank. Ein neues Konto wird zusammen mit den ausgewählten Buchungen angelegt. Beim nächsten Auszug erkennt Frank die bestätigte Quelle anhand eines lokal erzeugten Prüfwerts. Bei fehlenden oder mehrdeutigen Kennungen wählst du das Konto selbst. Mehrere Quellen eines Auszugs lassen sich auch auf einem gemeinsamen Konto verbuchen. Unter «Mehr → Konten & Karten» kannst du vorhandene Konten umbenennen, ihre letzten vier Ziffern ergänzen und getrennte Einträge mit einer Vorschau zusammenführen. Bei Yuh bleibt die Kontoendung leer, sofern du sie nicht selbst einträgst.

## PC und iPhone abgleichen

1. Beide Geräte ins gleiche lokale Netzwerk bringen und Frank öffnen. Unter «Mehr → Geräte verbinden» am PC «Verbindung starten» und am iPhone «Verbindung beitreten» wählen. Beim ersten Start am PC führt «Vorhandenen Frank-Datenstand von einem Gerät übernehmen» direkt dorthin.
2. Einladungscode und Antwortcode per QR oder Kopieren austauschen. Kontrollcode auf beiden Geräten vergleichen. Beide Fenster offen lassen.
3. «Daten vergleichen» am PC wählen und am iPhone freigeben. Beim ersten Abgleich den gewünschten Ausgangsstand auswählen und am zweiten Gerät bestätigen. Bei späteren Vergleichen kann Frank Änderungen zum letzten gemeinsamen Stand zusammenführen. Bei widersprüchlichen Änderungen zeigt Frank die betroffenen Bereiche.
4. Am PC unter «Ausgaben → CSV» oder «Sparen → Anlagen» importieren. Solange beide Fenster verbunden bleiben, genügt danach «Erneut vergleichen». Bei einer neuen Sitzung die Geräte erneut koppeln.

Der Geräteabgleich überträgt den Frank-Datenstand direkt über eine verschlüsselte WebRTC-Verbindung. CSV- und PDF-Originaldateien, Kursschlüssel und gerätespezifische Anzeigeoptionen bleiben auf ihrem Gerät.

## Schweizer Lohnausweis importieren

Unter «Mehr → Einnahmen & Lohn» in der Karte «Lohnausweis» ein PDF oder eine CSV auswählen. Frank liest Text-PDFs und ausgefüllte PDF-Formulare lokal. Für einen Bildscan braucht es zuerst eine PDF-Texterkennung. Eine CSV kann beispielsweise die Spalten `Ziffer;Betrag;Jahr` enthalten.

Vor dem Speichern lassen sich Brutto- und Nettolohn, Sozialabzüge, Pensionskassenbeiträge und bezifferte Spesen prüfen. Effektive Spesen (Ziffer 13.1) und Pauschalspesen (13.2) erscheinen getrennt. Eine vereinbarte Monatspauschale lässt sich mit ihrer steuerlichen Behandlung ausdrücklich in den Lohnplan übernehmen.

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
