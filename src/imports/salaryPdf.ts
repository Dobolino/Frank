import { getDocument, GlobalWorkerOptions, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFPageProxy } from 'pdfjs-dist';
import { parseSalaryCertificateText } from '../domain/salaryCertificate';

GlobalWorkerOptions.workerSrc = workerUrl;
type Cell = { x: number; y: number; text: string };
type Field = { key: string; value: string };

async function pageData(page: PDFPageProxy) {
  const [content, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
  const transform = page.getViewport({scale: 1}).transform;
  const cells: Cell[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const coords = Util.transform(transform, item.transform);
    cells.push({x: coords[4]!, y: coords[5]!, text:item.str.trim()});
  }
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: Cell[][] = [];
  for (const cell of cells) {
    const line = groups.at(-1);
    if (line && Math.abs(line[0]!.y - cell.y) <= 3) line.push(cell);
    else groups.push([cell]);
  }
  const lines = groups.map(group => group.sort((a, b) => a.x - b.x).map(cell => cell.text).join(' '));
  const form: Field[] = [];
  const dates: Record<string, string> = {TextLinks_D:'year', 'TextLinks_E-von':'from', 'TextLinks_E-bis':'to'};
  for (const field of annotations) {
    if (typeof field.fieldName !== 'string') continue;
    const name = field.fieldName.split('.').at(-1);
    if (field.fieldType === 'Tx' && typeof field.fieldValue === 'string') {
      const position = /^DezZahlNull_(\d+(?:_\d+)*)$/.exec(name)?.[1]?.replace(/_/g, '.');
      const key = position ?? (Object.hasOwn(dates, name) ? dates[name] : undefined);
      if (key) form.push({key, value:field.fieldValue});
    }
    if (name === 'OptionKreuzOhneRahmen_13_1_1' && field.fieldValue && field.fieldValue !== 'Off') {
      form.push({key:'13.1.1', value:'X'});
    }
    if (name === 'OptionKreuzOhneRahmen_B' && field.fieldValue && field.fieldValue !== 'Off') {
      throw new Error('Dieses Formular ist als Rentenbescheinigung markiert. Bitte einen Lohnausweis wählen.');
    }
  }
  return {lines, form};
}

export async function readSalaryCertificatePdf(data: Uint8Array) {
  const task = getDocument({data, useWasm: false, useWorkerFetch: false, disableFontFace: true, useSystemFonts: true});
  try {
    const doc = await task.promise;
    if (doc.numPages > 30) throw new Error('Bitte nur die Seiten eines einzelnen Lohnausweises auswählen.');
    let certificate: Awaited<ReturnType<typeof pageData>> | undefined;
    let hasText = false;
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const {lines, form} = await pageData(page);
      page.cleanup();
      hasText ||= lines.length > 0;
      const titled = lines.some(line => /lohnausweis|certificat de salaire|certificato di salario|salary certificate/i.test(line));
      const section = lines.some(line => /bruttolohn|salaire brut|salario lordo|nettolohn|salaire net|salario netto/i.test(line));
      if (!form.length && !(titled && section)) continue;
      if (certificate) throw new Error('Das PDF enthält mehrere Lohnausweise. Bitte jeden Ausweis einzeln importieren.');
      certificate = {lines, form};
    }
    if (!certificate) throw new Error(hasText
      ? 'Keinen Schweizer Lohnausweis mit lesbaren Ziffern erkannt. Bitte den Ausweis prüfen.'
      : 'Dieser PDF-Scan enthält keinen auslesbaren Text. Verwende ein PDF mit Textebene, eine CSV oder erfasse die Werte von Hand.');
    return parseSalaryCertificateText(certificate.lines, certificate.form);
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new Error('Das PDF ist passwortgeschützt. Bitte eine bereits entsperrte Kopie wählen.');
    }
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('Das PDF konnte nicht geöffnet werden.');
    throw error;
  } finally {
    await task.destroy();
  }
}
