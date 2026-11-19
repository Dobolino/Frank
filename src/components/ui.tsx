import { useEffect, useState, type ReactNode } from 'react';
import { formatChf, parseChf, type Rappen } from '../domain/money';
import { haptic } from '../app/haptics';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-[18px] border border-line bg-panel p-4 sm:p-5', className)}>
      {(title || action) && (
        <header className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
          {title && <h2 className="min-w-0 flex-auto text-base font-semibold tracking-tight text-text">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Tone = 'default' | 'good' | 'bad' | 'warn' | 'info';
const toneText: Record<Tone, string> = {
  default: 'text-text',
  good: 'text-accent',
  bad: 'text-danger',
  warn: 'text-warn',
  info: 'text-info',
};

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('num mt-1 text-2xl font-semibold', toneText[tone])}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Money({ value, className, decimals = true, signed = false }: { value: Rappen; className?: string; decimals?: boolean; signed?: boolean }) {
  const text = formatChf(value, { decimals });
  return <span className={cx('num', className)}>{signed && value > 0 ? `+${text}` : text}</span>;
}

/** Aufklappbarer Bereich für Details. */
export function Collapsible({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line bg-panel-2/60">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm select-none hover:bg-panel-2">
        <span className="text-muted transition-transform group-open:rotate-90">›</span>
        <div className="flex-1">{summary}</div>
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}

const inputBase =
  'rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/20';

/** Betragsfeld in CHF; speichert beim Verlassen oder mit Enter. */
export function MoneyInput({ value, onChange, className, ariaLabel }: { value: Rappen; onChange: (r: Rappen) => void; className?: string; ariaLabel?: string }) {
  const [text, setText] = useState(formatChf(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatChf(value));
  }, [value, focused]);
  const commit = () => {
    const parsed = parseChf(text);
    if (parsed !== null && parsed !== value) onChange(parsed);
    else setText(formatChf(value));
  };
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      className={cx(inputBase, 'num w-28 text-right', className)}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

export function NumberInput({ value, onChange, step = 0.01, suffix, className, ariaLabel }: { value: number; onChange: (n: number) => void; step?: number; suffix?: string; className?: string; ariaLabel?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        aria-label={ariaLabel}
        type="number"
        step={step}
        className={cx(inputBase, 'num w-24 text-right', className)}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  );
}

export function TextInput({ value, onChange, className, placeholder, ariaLabel }: { value: string; onChange: (s: string) => void; className?: string; placeholder?: string; ariaLabel?: string }) {
  return <input aria-label={ariaLabel} className={cx(inputBase, className)} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Select<T extends string | number>({ value, options, onChange, className, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string; ariaLabel?: string }) {
  return (
    <select
      aria-label={ariaLabel}
      className={cx(inputBase, 'pr-7', className)}
      value={String(value)}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        if (opt) onChange(opt.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Button({ children, onClick, variant = 'default', className, title, ariaLabel, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'ghost' | 'danger'; className?: string; title?: string; ariaLabel?: string; type?: 'button' | 'submit' }) {
  const styles = {
    default: 'border border-line bg-panel-2 hover:bg-line text-text',
    primary: 'bg-accent text-bg hover:bg-accent/90 font-medium',
    ghost: 'text-muted hover:text-text hover:bg-panel-2',
    danger: 'border border-danger/40 text-danger hover:bg-danger/10',
  }[variant];
  return (
    <button type={type} title={title} aria-label={ariaLabel} onClick={onClick} className={cx('rounded-lg px-3 py-1.5 text-sm transition-colors', styles, className)}>
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
      <span className="relative inline-flex h-5 w-9 shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => {
            haptic();
            onChange(e.target.checked);
          }}
          className="peer sr-only"
        />
        <span aria-hidden className="absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-panel" />
        <span aria-hidden className="pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-text transition-transform peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: Tone }) {
  const styles: Record<Tone, string> = {
    default: 'bg-panel-2 text-muted border-line',
    good: 'bg-accent/10 text-accent border-accent/30',
    bad: 'bg-danger/10 text-danger border-danger/30',
    warn: 'bg-warn/10 text-warn border-warn/30',
    info: 'bg-info/10 text-info border-info/30',
  };
  return <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs', styles[tone])}>{children}</span>;
}

export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((w) => (
        <div key={w} className="flex gap-2 rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-sm text-warn">
          <span aria-hidden>⚠</span>
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

/** Einfacher horizontaler Balken (0..1). */
export function Bar({ value, tone = 'good' }: { value: number; tone?: Tone }) {
  const color = { default: 'bg-muted', good: 'bg-accent', bad: 'bg-danger', warn: 'bg-warn', info: 'bg-info' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line">
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Row({ label, value, strong, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; hint?: ReactNode }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 py-1.5 text-sm', strong && 'border-t border-line pt-2.5 font-semibold')}>
      <span className={strong ? 'text-text' : 'text-muted'}>
        {label}
        {hint && <span className="ml-2 text-xs text-muted/70">{hint}</span>}
      </span>
      <span className="num">{value}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.85rem] leading-tight font-bold tracking-[-.05em] sm:text-[2.5rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Umschalter für 2 bis 3 gleichwertige Ansichten. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string; className?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('flex rounded-xl border border-line bg-panel-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => {
            if (o.value !== value) haptic();
            onChange(o.value);
          }}
          className={cx('flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors', o.value === value ? 'bg-panel font-semibold text-text shadow' : 'text-muted hover:text-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Merkt sich eine Ansicht-Auswahl auf diesem Gerät (nur Bedienkomfort, keine Daten). */
export function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(`frank.view.${key}`) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(`frank.view.${key}`, v);
    } catch {
      /* privat oder gesperrt: Auswahl gilt nur für diese Sitzung */
    }
  };
  return [value, set];
}
