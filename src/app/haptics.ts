/**
 * Kurzes haptisches Feedback.
 *
 * - Android/Chrome: Vibration API.
 * - iOS: Safari kennt die Vibration API nicht. Seit iOS 18 löst das Umschalten eines
 *   `<input type="checkbox" switch>` ein Systemfeedback aus. Frank schaltet dafür einen
 *   unsichtbaren Schalter um. Das funktioniert nur innerhalb einer Berührung oder eines Klicks.
 * - Ältere iOS-Versionen: kein Feedback, ohne Fehler.
 */
let iosSwitch: HTMLLabelElement | null = null;

function iosLabel(): HTMLLabelElement {
  if (iosSwitch) return iosSwitch;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-10px;top:-10px';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitch = label;
  return label;
}

const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function haptic(): void {
  if (typeof document === 'undefined' || reducedMotion()) return;
  try {
    if (typeof navigator.vibrate === 'function' && !isIOS()) {
      navigator.vibrate(8);
      return;
    }
    if (isIOS()) iosLabel().click();
  } catch {
    /* Haptik ist nur eine Zugabe */
  }
}
