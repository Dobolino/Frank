import type { ReactNode } from 'react';
import { formatChf, type Rappen } from '../domain/money';
import './savingsArea.css';

export function SavingsAreaHeader({ area, action }: { area: 'savings' | 'invest'; action?: ReactNode }) {
  const title = area === 'savings' ? 'Sparen' : 'Anlagen';
  return (
    <header className="sa-header">
      <div className="sa-title-menu">
        <h1>{title}</h1>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <select aria-label="Sparen oder Anlagen" value={area} onChange={e => { window.location.hash = e.target.value; }}>
          <option value="savings">Sparen</option>
          <option value="invest">Anlagen</option>
        </select>
      </div>
      {action}
    </header>
  );
}

/** Abstände auf der Zeitachse können bei manuell erfassten Monatsständen variieren. */
export function BalanceCurve({ points, selected, buffer, title }: {
  points: { time: number; label: string; value: Rappen }[]; selected: number; buffer?: Rappen; title: string;
}) {
  if (points.length < 2) return null;
  const first = points[0]!, last = points[points.length - 1]!;
  const values = points.map(point => point.value);
  if (buffer !== undefined) values.push(buffer);
  const low = Math.min(...values), high = Math.max(...values);
  const range = high - low || Math.max(Math.abs(high) * .1, 100);
  const x = (time: number) => 5 + (time - first.time) * 310 / Math.max(last.time - first.time, 1);
  const y = (value: number) => high === low ? 53 : 88 - (value - low) * 68 / range;
  const path = points.map((point,i) => `${i ? 'L' : 'M'} ${x(point.time)} ${y(point.value)}`).join(' ');
  const active = points[selected];
  return (
    <div className="sa-curve">
      <svg viewBox="0 0 320 103" preserveAspectRatio="none" role="img" aria-label={`${title}. ${points.map(p => p.label + ' CHF ' + formatChf(p.value, {decimals:false})).join(', ')}`}>
        {[21,54,87].map(grid => <path key={grid} d={`M5 ${grid} H315`} className="sa-gridline"/>)}
        <path d={`${path} L315 101 H5 Z`} fill="var(--color-accent)" opacity=".075"/>
        {buffer !== undefined && <path d={`M5 ${y(buffer)} H315`} stroke="var(--color-warn)" strokeDasharray="3 4" fill="none"/>}
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
        {active && <circle cx={x(active.time)} cy={y(active.value)} r="3.8" fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth="1.6"/>}
      </svg>
      <div className="sa-axis"><span>{first.label}</span><span>{last.label}</span></div>
    </div>
  );
}
