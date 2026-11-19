import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './shared';

const pairingFormat = /^FRANK1\.[OA]\.[A-Za-z0-9_-]{16}\.[ZT]\.[A-Za-z0-9_-]+$/;
const codeField = 'block min-h-12 w-full rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-xs';

export function ShowPairingCode({ code, label }: { code: string; label: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [qr, setQr] = useState<{ code: string; image?: string }>();
  const [copied, setCopied] = useState<{ code: string; message: string }>();
  const id = useId();

  useEffect(() => {
    let active = true;
    if (code) {
      import('qrcode').then(({ toDataURL }) => toDataURL(code, {
        errorCorrectionLevel: code.length > 1800 ? 'L' : 'M', margin: 4, scale: 5,
      })).then(image => { if (active) setQr({ code, image }); })
        .catch(() => { if (active) setQr({ code }); });
    }
    return () => { active = false; };
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied({ code, message: 'Code kopiert.' });
    } catch {
      field.current?.focus();
      field.current?.select();
      let success = false;
      try { success = document.execCommand('copy'); } catch { /* Text bleibt markiert. */ }
      setCopied({ code, message: success ? 'Code kopiert.' : 'Code markiert. Wähle «Kopieren».' });
    }
  }
  const ready = qr?.code === code ? qr : undefined;
  return <div className="space-y-2">
    {ready?.image && <img src={ready.image} alt={'QR-Code für ' + label} width={360} height={360}
      className="mx-auto block h-auto w-full max-w-[360px] rounded-lg bg-white [image-rendering:pixelated]" />}
    {ready && !ready.image && <p className="text-xs text-muted">Verwende für diesen Verbindungscode die Textkopie.</p>}
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <textarea ref={field} id={id} className={codeField} value={code} readOnly rows={2} spellCheck={false}
      onFocus={event => event.currentTarget.select()} />
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={copy}>Code kopieren</Button>
      <span role="status" className="text-xs text-muted">{copied?.code === code ? copied.message : ''}</span>
    </div>
  </div>;
}

export function ReadPairingCode({ label, onSubmit }: { label: string; onSubmit: (code: string) => void }) {
  const [value, setValue] = useState('');
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const id = useId();

  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const player = video.current;
    const end = () => setScanning(false);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') end(); };
    const visibility = () => { if (document.hidden) end(); };
    window.addEventListener('hashchange', end);
    document.addEventListener('keydown', escape);
    document.addEventListener('visibilitychange', visibility);

    async function scan() {
      if (!player || !navigator.mediaDevices?.getUserMedia) {
        setStatus('Keine Kamera verfügbar. Du kannst den Code einfügen.'); end(); return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } });
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
        const track = stream.getVideoTracks()[0];
        if (track) track.onended = () => { if (!stopped) { setStatus('Kamera beendet.'); end(); } };
        player.srcObject = stream;
        await player.play();
        const { default: decode } = await import('jsqr');
        if (stopped) return;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Kamerabild unlesbar');
        setStatus('Halte den QR-Code vollständig ins Kamerabild.');
        // Dense codes on another screen can alias at one camera sampling resolution.
        // Vary the sampling grid across attempts without decoding any frame twice.
        let smallerFrame = false;
        const next = () => {
          if (stopped) return;
          if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && player.videoWidth && player.videoHeight) {
            const scale = Math.min(1, 1280 / Math.max(player.videoWidth, player.videoHeight)) * (smallerFrame ? 0.9 : 1);
            smallerFrame = !smallerFrame;
            const w = Math.round(player.videoWidth * scale), h = Math.round(player.videoHeight * scale);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            context.drawImage(player, 0, 0, w, h);
            const result = decode(context.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
            if (result && pairingFormat.test(result.data)) {
              setValue(result.data); setStatus('Code erfasst. Tippe auf «Code verwenden».'); end(); return;
            }
            if (result) setStatus('Das ist kein Frank-Verbindungscode. Scanne den Code des anderen Geräts.');
          }
          timer = setTimeout(next, 180);
        };
        next();
      } catch (error) {
        if (stopped) return;
        const denied = error instanceof DOMException && error.name === 'NotAllowedError';
        setStatus(denied ? 'Kamerazugriff verweigert. Du kannst den Code einfügen.' : 'Kamera nicht verfügbar. Du kannst den Code einfügen.');
        end();
      }
    }
    void scan();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
      if (player) player.srcObject = null;
      window.removeEventListener('hashchange', end);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [scanning]);

  return <div className="space-y-2">
    <label className="block text-sm font-medium" htmlFor={id}>{label}</label>
    <textarea id={id} className={codeField} rows={2} maxLength={49152} value={value} spellCheck={false}
      autoCapitalize="none" autoCorrect="off" placeholder="Code vom anderen Gerät einfügen"
      onChange={event => { setValue(event.target.value); setStatus(''); }} />
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => { setStatus(''); setScanning(!scanning); }}>{scanning ? 'Kamera schliessen' : 'QR-Code scannen'}</Button>
      <button type="button" disabled={!value.trim()} className="min-h-10 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-40"
        onClick={() => { setScanning(false); onSubmit(value.trim()); }}>Code verwenden</button>
    </div>
    {scanning && <video ref={video} autoPlay muted playsInline aria-label="Kameravorschau" className="max-h-64 w-full rounded-lg bg-black object-contain" />}
    <p className="text-xs text-muted" role="status">{status}</p>
  </div>;
}
