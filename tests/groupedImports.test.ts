import { describe, expect, it } from 'vitest';
import { mergeTransactions } from '../src/domain/actuals';
import { newAccountRecognitionKey, type AccountRecognitionPreview } from '../src/domain/accountRecognition';
import { buildImportTargets, saveImportTargets, targetProblem } from '../src/features/useImportTargets';
import { demoData } from '../src/seed/demo';
import { parseAppData } from '../src/storage/storage';

const a = '1'.repeat(64), b = '2'.repeat(64);
const row = { date:'2026-06-02', text:'Testzahlung', amount:-550 };
const twoCards: AccountRecognitionPreview = { key:newAccountRecognitionKey(), sources:[
  { source:'XXXX0011', type:'card', bankId:'ubs', fingerprint:a, masked:true },
  { source:'XXXX0022', type:'card', bankId:'ubs', fingerprint:b, masked:true },
] };
const yuh: AccountRecognitionPreview = { key:'', sources:[{ source:'', bankId:'yuh', type:'bank' }] };

describe('Gemeinsame Zielkonten', () => {
  it('erbittet bei mehreren Yuh-Konten eine Zuordnung und schlägt ein einzelnes transparent vor', () => {
    const data = demoData();
    expect(buildImportTargets(data,yuh,'expenses').targets[0]?.selected).toMatchObject({bankId:'yuh',type:'bank'});
    data.importAccounts = [{id:'bank',name:'Alltag',bankId:'yuh',type:'bank'}];
    expect(buildImportTargets(data,yuh,'expenses').targets[0]?.selected?.id).toBe('bank');
    data.importAccounts.push({id:'zweites',name:'Reise',bankId:'yuh',type:'bank'});
    expect(buildImportTargets(data,yuh,'expenses').targets[0]?.selected).toBeUndefined();
    const hint = buildImportTargets(data,yuh,'invest').targets[0];
    expect(hint?.selected?.lastFour).toBeUndefined();
  });
  it('legt ein gemeinsames Konto für mehrere echte Quellen an und bindet beide an dasselbe Ziel', () => {
    const data = demoData();
    const { shared,targets } = buildImportTargets(data,twoCards,'expenses');
    const selected = { ...shared.proposed, name:'Privat' };
    const reviewed = targets.map(t=>({...t,selected}));
    expect(targetProblem(reviewed,[])).toBeUndefined();
    saveImportTargets(data,twoCards,reviewed);
    expect(data.importAccounts).toEqual([selected]);
    expect(data.accountRecognition?.bindings).toEqual({[a]:selected.id,[b]:selected.id});
    expect(parseAppData(JSON.stringify(data))).toEqual(data);
  });
  it('merkt bei getrennten eindeutigen Quellen nur deren Endziffern und behält manuelle Endungen', () => {
    const data = demoData();
    const {targets} = buildImportTargets(data,twoCards,'expenses');
    saveImportTargets(data,twoCards,targets);
    expect(data.importAccounts?.map(account=>account.lastFour)).toEqual(['0011','0022']);
    data.importAccounts![0]!.lastFour = '0110';
    saveImportTargets(data,twoCards,targets);
    expect(data.importAccounts?.[0]?.lastFour).toBe('0110');
  });
  it('erhält identische Zahlungen zweier Karten bei Einzel-, Gesamt- und Teilimport', () => {
    const rows = [a,b,a].map(sourceFingerprint=>({...row,accountId:'privat',sourceFingerprint}));
    const first = mergeTransactions([],rows.slice(0,1),[]);
    const next = mergeTransactions(first.list,rows.slice(1,2),[]);
    expect(next.added).toBe(1);
    const all = mergeTransactions(next.list,rows,[]);
    expect(all.list).toHaveLength(3);
    expect(all.list.map(t=>t.sourceFingerprint).sort()).toEqual([a,a,b]);
    expect(mergeTransactions(all.list,[rows[0]!],[]).added).toBe(0);
    expect(mergeTransactions(all.list,rows,[]).list).toEqual(all.list);
  });
  it('übernimmt bei einem erneuten Yuh-Import die geprüfte Behandlung der Geldbewegung in beide Richtungen', () => {
    const previous = { ...row, id:'behalten', accountId:'yuh', merchantId:'h', item:'Sparziel' };
    const regular = { ...row, id:'zweite', accountId:'yuh', amount:-100, excludedFromSpend:true };
    const movement = {...row, accountId:'yuh', category:'Sparziel-Übertrag', excludedFromSpend:true};
    const result = mergeTransactions([previous,regular], [movement,{...regular}], [], {}, new Map([[movement,true]]));
    expect(result.added).toBe(0);
    expect(result.list[0]).toMatchObject({...previous,excludedFromSpend:true});
    const included = {...row, accountId:'yuh', category:'Sparziel-Übertrag'};
    const next = mergeTransactions(result.list, [included,{...regular}], [], {}, new Map([[included,false]]));
    expect(next.list).toEqual([previous,regular]);
  });
  it('zieht vorhandene alte Buchungen einer bekannten Quelle beim Wechsel des Ziels einmalig um', () => {
    const existing = [{ ...row, id:'behalten', accountId:'alt', item:'Essen' }];
    const input = [{...row,accountId:'neu',sourceFingerprint:a}, {...row,accountId:'neu',sourceFingerprint:b}];
    const result = mergeTransactions(existing,input,[],{[a]:'alt'});
    expect(result.added).toBe(1);
    expect(result.list[0]).toMatchObject({id:'behalten',accountId:'neu',item:'Essen',sourceFingerprint:a});
    expect(mergeTransactions(result.list,input,[],{[a]:'neu',[b]:'neu'}).added).toBe(0);
  });
});
