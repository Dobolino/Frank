/** Yuh exports one activity statement for the account. CARD NUMBER describes the
 * payment instrument on individual purchases; it never identifies the account. */
export function yuhColumns(header: string[]) {
  const labels = header.map(value => value.trim().toUpperCase());
  const find = (name: string) => labels.indexOf(name);
  const cols = {
    date: find('DATE'), activity: find('ACTIVITY TYPE'), name: find('ACTIVITY NAME'),
    debit: find('DEBIT'), debitCurrency: find('DEBIT CURRENCY'),
    credit: find('CREDIT'), creditCurrency: find('CREDIT CURRENCY'),
    side: find('BUY/SELL'), quantity: find('QUANTITY'), asset: find('ASSET'),
  };
  if ([cols.date, cols.name, cols.activity, cols.debit, cols.debitCurrency, cols.credit, cols.creditCurrency].some(i => i < 0)) return;
  if (find('CARD NUMBER') < 0 && cols.side < 0 && find('FEES/COMMISSION') < 0) return;
  return cols;
}

export type YuhColumns = NonNullable<ReturnType<typeof yuhColumns>>;
export const notBooked = (activity: string) => /(?:^|_)(?:REJECTED|PENDING|CANCELLED|CANCELED|FAILED|DECLINED)(?:_|$)/.test(activity);

export function yuhTradeKind(row: string[], cols: YuhColumns): 'buy' | 'sell' | 'dividend' | undefined {
  const activity = (row[cols.activity] ?? '').trim().toUpperCase();
  if (notBooked(activity) || !row[cols.asset]?.trim()) return;
  if (/(?:^|_)(?:DIVIDEND|DIVIDENDS)(?:_|$)/.test(activity)) return 'dividend';
  const side = (row[cols.side] ?? '').trim().toUpperCase();
  if (['BUY','KAUF','ACHAT','ACQUISTO'].includes(side)) return 'buy';
  if (['SELL','VERKAUF','VENTE','VENDITA'].includes(side)) return 'sell';
  if (/(?:^|_)(?:TRADE|SECURITIES|INVESTMENT)_(?:BUY|BOUGHT)(?:_|$)/.test(activity)) return 'buy';
  if (/(?:^|_)(?:TRADE|SECURITIES|INVESTMENT)_(?:SELL|SOLD)(?:_|$)/.test(activity)) return 'sell';
}

export function yuhMovement(row: string[], cols: YuhColumns): string | undefined {
  const activity = (row[cols.activity] ?? '').trim().toUpperCase();
  if (['GOAL_DEPOSIT', 'GOAL_WITHDRAWAL'].includes(activity)) return 'Sparziel-Überträge';
  if (yuhTradeKind(row, cols)) return 'Anlagegeschäfte';
  if (activity.includes('ORDER_EXECUTED') || /(?:^|_)(?:FX|FOREX|EXCHANGE)(?:_|$)/.test(activity)) {
    const debit = row[cols.debitCurrency]?.trim().toUpperCase();
    const credit = row[cols.creditCurrency]?.trim().toUpperCase();
    // Some exports wrap free text in literal quotes inside an already quoted CSV cell.
    const name = (row[cols.name] ?? '').trim().replace(/^"(.*)"$/s, '$1').trim();
    if ((debit && credit && debit !== credit) || /^(?:umtausch|(?:automatischer? )?(?:währungs)?wechsel|(?:automatic )?(?:currency )?(?:exchange|conversion)|change(?: automatique)?|cambio)\b/i.test(name)) {
      return 'Währungswechsel';
    }
    // A settled trade with an asset and units still moves savings even when
    // the export leaves the buy/sell side blank.
    if (row[cols.asset]?.trim() && row[cols.quantity]?.trim()) return 'Anlagegeschäfte';
  }
}
