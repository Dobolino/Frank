import { useEffect, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { FrankIcon } from '../components/FrankIcon';
import type { AppData } from '../domain/types';
import { DeviceLink } from '../sync/transport';
import { SyncSession, type SyncView, type Choice } from '../sync/session';
import { ShowPairingCode, ReadPairingCode } from './PairingCode';
import { Card, PageHeader } from './shared';
import './deviceSync.css';

type Pair = 'start' | 'preparing' | 'enterOffer' | 'offer' | 'answer' | 'waiting' | 'online';
const labels: Record<Choice,string> = {
  local: 'Diesen Datenstand auf beide Geräte übernehmen', peer: 'Stand vom zweiten Gerät auf beide übernehmen',
  merge: 'Gemeinsamen Stand vorschlagen', preferLocal: 'Bei Konflikten dieses Gerät bevorzugen',
  preferPeer: 'Bei Konflikten das zweite Gerät bevorzugen',
};
function Summary({title,data}:{title:string;data:AppData|null}) {
  return <div className="sync-summary"><strong>{title}</strong>{data
    ? <p>{Object.keys(data.years).sort().join(', ')} · {data.importAccounts?.length ?? 0} Importkonten · {(data.transactions?.length ?? 0) + (data.investmentTransactions?.length ?? 0)} Buchungen · {data.goals.length} Sparziele</p>
    : <p>Frank wurde hier noch nicht eingerichtet.</p>}</div>;
}

async function checkCode(offer: string, answer: string) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(offer.replace(/\s/g,'')+'\n'+answer.replace(/\s/g,'')));
  const code = new DataView(digest).getUint32(0) % 1_000_000;
  return String(code).padStart(6,'0').replace(/^(\d{3})/, '$1 ');
}

export default function DeviceSyncPage() {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;
  const link = useRef<DeviceLink | null>(null);
  const session = useRef<SyncSession | null>(null);
  const offer = useRef('');
  const [pair,setPair] = useState<Pair>('start');
  const [out,setOut] = useState('');
  const [check,setCheck] = useState('');
  const [view,setView] = useState<SyncView>({step:'connected'});
  const [host,setHost] = useState(false);
  const [error,setError] = useState('');

  function dispose() {
    session.current?.close();
    session.current = null;
    const active = link.current;
    link.current = null;
    active?.close();
  }
  useEffect(() => () => dispose(), []);

  function disconnect(reason = '') {
    dispose();
    offer.current = '';
    setOut(''); setCheck(''); setError(reason); setPair('start');
    setView({step:'connected'});
  }
  function makeLink(isHost:boolean) {
    dispose();
    setHost(isHost); setError(''); setCheck('');
    const conn = new DeviceLink({
      onOpen: () => { if (link.current === conn) { setPair('online');setOut('');setView({step:'connected'}); } },
      onClose: reason => { if (link.current === conn) disconnect(reason); },
      onMessage: text => {
        const round = session.current;
        if (link.current === conn && round) void round.message(text).catch(e => round.stop(e.message));
      },
    });
    link.current = conn;
    session.current = new SyncSession(isHost,{
      current: () => storeRef.current.getSyncSnapshot(),
      save: (expected,next) => storeRef.current.applySync(expected,next),
      send: message => conn.send(message),
      change: state => { if (link.current === conn) setView(state); },
    });
    return conn;
  }
  async function start(offerCode?: string) {
    let conn: DeviceLink | undefined;
    try {
      setPair('preparing');
      conn = makeLink(offerCode === undefined);
      if (offerCode === undefined) {
        const code = await conn.createOffer();
        if (link.current !== conn) return;
        offer.current = code;
        setOut(code); setPair('offer');
      } else {
        const answer = await conn.createAnswer(offerCode);
        const digits = await checkCode(offerCode,answer);
        if (link.current !== conn) return;
        setCheck(digits); setOut(answer);
        setPair(current => current === 'online' ? current : 'answer');
      }
    } catch (e) {
      if (!conn || conn === link.current) disconnect(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen.');
    }
  }
  async function accept(answer:string) {
    const conn = link.current;
    if (!conn) return;
    try {
      const digits = await checkCode(offer.current,answer);
      if (conn !== link.current) return;
      setPair('waiting');setError('');setCheck(digits);
      await conn.acceptAnswer(answer);
    } catch (e) {
      if (conn === link.current) { setError(e instanceof Error ? e.message : 'Antwortcode prüfen.');setPair('offer'); }
    }
  }
  function run(action:(s:SyncSession)=>Promise<void>) {
    const s = session.current;
    if (s) void action(s).catch(e=>s.stop(e instanceof Error ? e.message : 'Abgleich fehlgeschlagen.'));
  }

  return <div className="device-sync">
    <PageHeader title="Geräte verbinden" subtitle="Frank auf PC und iPhone" />
    {pair === 'start' ? <Card title="Im selben WLAN verbinden">
      <div className="sync-intro"><FrankIcon name="devices" size={35}/><p>Öffne Frank auf beiden Geräten. So kannst du am PC importieren und Budget, Lohn, Konten und Buchungen auf dein iPhone übernehmen.</p></div>
      <div className="sync-buttons"><button className="sync-primary" onClick={()=>void start()}>Verbindung starten</button>
        <button onClick={()=>{setError('');setPair('enterOffer');}}>Verbindung beitreten</button></div>
    </Card> : null}
    {error && <p role="alert" className="sync-warning">{error}</p>}
    {pair === 'preparing' && <p role="status">Lokale Verbindung wird vorbereitet …</p>}
    {pair === 'enterOffer' && <Card title="Einladung vom ersten Gerät"><ReadPairingCode label="Einladungscode" onSubmit={v=>void start(v)}/></Card>}
    {pair === 'offer' && <><Card title="Zweites Gerät einladen">
      <p>Öffne dort «Geräte verbinden» → «Verbindung beitreten» und scanne diesen Code oder kopiere ihn auf dein zweites Gerät.</p>
      <ShowPairingCode code={out} label="Einladungscode"/>
    </Card><Card title="Antwort vom zweiten Gerät"><ReadPairingCode label="Antwortcode" onSubmit={v=>void accept(v)}/></Card></>}
    {pair === 'answer' && <Card title="Antwort zurückgeben"><p>Scanne diesen Code am ersten Gerät oder füge ihn dort unter «Antwortcode» ein. Lass beide Fenster offen.</p><ShowPairingCode code={out} label="Antwortcode"/></Card>}
    {pair === 'waiting' && <p role="status">Verbindung wird hergestellt …</p>}
    {pair === 'online' && <Card title="Direkte Verbindung">
      <div className="sync-badge"><span aria-hidden="true"/> Verbunden · Kontrollcode <b>{check}</b></div>
      {view.step === 'connected' && (host ? <>
        <p>Vergleiche den Kontrollcode. Wenn er auf beiden Geräten übereinstimmt, starte den Datenvergleich.</p>
        <button className="sync-primary" disabled={!check} onClick={()=>run(s=>s.begin())}>Daten vergleichen</button>
      </> : <p>Warte, bis am ersten Gerät «Daten vergleichen» gewählt wurde.</p>)}
      {view.step === 'requested' && <p role="status">Gib den Vergleich am zweiten Gerät frei.</p>}
      {view.step === 'invited' && <><p>Vergleiche zuerst den Kontrollcode auf beiden Geräten. Mit der Freigabe sendest du deinen Frank-Datenstand über die verschlüsselte Direktverbindung an das erste Gerät.</p>
        <button className="sync-primary" disabled={!check} onClick={()=>run(s=>s.share())}>Zum Vergleich freigeben</button></>}
      {view.step === 'review' && <>
        <h2>Datenstände vergleichen</h2>
        <div className="sync-summaries"><Summary title="Dieses Gerät" data={view.local}/><Summary title="Zweites Gerät" data={view.peer}/></div>
        <p>{view.reason || (view.choices.includes('merge') ? 'Die Stände stimmen überein oder ihre Änderungen lassen sich zusammenführen.' :
          view.conflicts.length ? 'Abweichende Änderungen betreffen '+view.conflicts.join(', ')+'. Wähle, welcher Stand bei diesen Unterschieden gilt.' :
          'Wähle den Ausgangsstand für beide Geräte. Der ausgewählte Stand ersetzt den anderen vollständig.')}</p>
        <div className="sync-buttons">{view.choices.map(choice=><button key={choice} className={view.choices.length===1?'sync-primary':''} onClick={()=>run(s=>s.propose(choice))}>{labels[choice]}</button>)}</div>
      </>}
      {view.step === 'approve' && <>
        <Summary title="Vorgeschlagener gemeinsamer Stand" data={view.proposed}/>
        <p>{view.choice === 'local' ? 'Der Stand des ersten Geräts ersetzt die hiesigen Daten.' : view.choice === 'peer' ? 'Dein Datenstand wird auch auf das erste Gerät übernommen.' : 'Die verglichenen Daten werden auf beiden Geräten gespeichert.'} Den vorherigen Stand findest du bei Bedarf unter «Daten &amp; Sicherung».</p>
        <div className="sync-buttons"><button className="sync-primary" onClick={()=>run(s=>s.approve())}>Stand übernehmen</button><button onClick={()=>run(s=>s.stop())}>Abbrechen</button></div>
      </>}
      {view.step === 'working' && <p role="status">Abgleich läuft. Lass Frank auf beiden Geräten offen und prüfe das zweite Fenster.</p>}
      {view.step === 'failed' && <p role="alert" className="sync-warning">{view.message}</p>}
      {view.step === 'complete' && <><h2>Beide Geräte sind auf demselben Stand.</h2><p>Du kannst jetzt CSV-Dateien am PC importieren. Öffne danach wieder «Geräte verbinden» und vergleiche erneut.</p>
        <a className="sync-import-link" href="#expenses">Zu Ausgaben und CSV-Import ›</a></>}
      {host && (view.step === 'complete' || view.step === 'failed') && <button className="sync-primary" onClick={()=>run(s=>s.begin())}>Erneut vergleichen</button>}
    </Card>}
    {pair !== 'start' && <button className="sync-cancel" onClick={()=>disconnect()}>{pair === 'online' ? 'Verbindung trennen' : 'Abbrechen'}</button>}
  </div>;
}
