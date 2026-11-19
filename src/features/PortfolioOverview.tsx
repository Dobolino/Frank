import { useState } from 'react';
import { useStore } from '../app/store';
import type { PortfolioSummary } from '../domain/investEngine';
import { formatPercent } from '../domain/money';
import { MONTH_NAMES } from '../domain/types';
import { BalanceCurve } from './SavingsArea';
import { Money, Select } from './shared';

const mixColors = ['#4ade80', '#3987e5', '#b978d3', '#e8bd69', '#53bbaa', '#ea8374'];

export function PortfolioOverview({ summary }: { summary: PortfolioSummary }) {
  const { data } = useStore();
  const [view, setView] = useState('composition');
  const history = [...(data.wealthHistory ?? [])].sort((a,b) => a.month.localeCompare(b.month)).slice(-12);
  const valued = summary.positions.length - summary.missing.length;
  const weighted = summary.weights.filter(row => row.share > 0).sort((a,b) => b.share-a.share);
  const countLabel = (n:number) => n === 1 ? '1 Position' : n+' Positionen';
  const gainCount = summary.positions.filter(p => p.gainChf !== null).length;
  const dayCount = summary.positions.filter(p => p.dayChangeChf !== null).length;
  const display = view === 'history' && history.length >= 2 ? 'history' : 'composition';
  const positions = new Map(summary.positions.map(p => [p.holding.id,p.holding]));
  const slices = weighted.slice(0,5).map(row => ({label:positions.get(row.id)!.name,share:row.share}));
  if (weighted.length > 5) slices.push({label:'Übrige',share:weighted.slice(5).reduce((sum,row)=>sum+row.share,0)});
  const points = history.map(record => {
    const [year, month] = record.month.split('-').map(Number) as [number,number];
    return {time: year * 12 + month-1, value:record.depot, label:MONTH_NAMES[month-1]+' '+year};
  });
  return <section className="sa-surface">
    <div className="sa-filters">
      <h2 className="font-semibold">{summary.missing.length ? 'Bewertete Positionen' : 'Depotwert'}</h2>
      {points.length >= 2 && <Select ariaLabel="Depotgrafik" value={display} onChange={setView} options={[{value:'composition',label:'Aufteilung'},{value:'history',label:'Gespeicherte Stände'}]}/>}
    </div>
    <div className="sa-summary"><strong>{valued ? <Money value={summary.totalChf}/> : '–'}</strong><small>CHF</small></div>
    <p className="sa-caption">{summary.positions.length ? countLabel(valued)+' bewertet' : 'Sobald eine Position mit Kurs erfasst ist, erscheint hier der Depotwert.'}</p>
    {display === 'history' ? <BalanceCurve points={points} selected={points.length-1} title="Gespeicherte Depotstände"/> : slices.length > 0 && <>
      <div className="sa-portfolio-mix" aria-hidden="true">{slices.map((row,index) => <i key={index} style={{flex:row.share,background:mixColors[index]}}/>)}</div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">{slices.map((row,index) =>
        <li key={index} className="flex min-w-0 items-center gap-1"><i className="size-2 shrink-0 rounded-full" style={{background:mixColors[index]}}/><span className="truncate">{row.label} · {formatPercent(row.share,0)}</span></li>)}</ul>
    </>}
    <dl className="sa-fields">
      <div><dt>Gewinn / Verlust{gainCount > 0 && gainCount < valued ? ' · '+countLabel(gainCount) : ''}</dt>
        <dd className={summary.gainChf < 0 ? 'text-danger' : summary.gainChf > 0 ? 'text-accent' : ''}>{gainCount ? <><Money value={summary.gainChf} signed/> CHF</> : '–'}</dd>
        {summary.gainPct !== null && <small className="sa-caption">{formatPercent(summary.gainPct)} seit Einstand</small>}
      </div>
      <div><dt>Tagesänderung{dayCount > 0 && dayCount < valued ? ' · '+countLabel(dayCount) : ''}</dt>
        <dd>{dayCount ? <><Money value={summary.dayChangeChf} signed/> CHF</> : '–'}</dd>
        {dayCount > 0 && <small className="sa-caption">laut letztem Kurs</small>}
      </div>
    </dl>
  </section>;
}
