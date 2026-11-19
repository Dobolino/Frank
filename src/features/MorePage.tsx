import type { ComponentProps } from 'react';
import { FrankIcon } from '../components/FrankIcon';
import { PageHeader } from './shared';
import './planning.css';

interface Destination {
  page: string;
  name: string;
  hint: string;
  icon: ComponentProps<typeof FrankIcon>['name'];
  color: string;
}

const sections: { title: string; links: Destination[] }[] = [
  { title: 'Einkommen & Steuern', links: [
    { page: 'salary', name: 'Einnahmen & Lohn', hint: 'Bruttolohn, Spesen und Auszahlung', icon: 'budget', color: '#86efac' },
    { page: 'tax', name: 'Steuern', hint: 'Steuervorschau, Abzüge und Rückstellung', icon: 'calculator', color: '#f6c877' },
  ] },
  { title: 'Planung', links: [
    { page: 'contracts', name: 'Verträge', hint: 'Miete, Versicherungen und Abos', icon: 'repeat', color: '#8ebcff' },
    { page: 'savings', name: 'Sparen', hint: 'Sparkonten, Sparziele und Säule 3a', icon: 'reserve', color: '#beb2f7' },
    { page: 'invest', name: 'Anlagen', hint: 'Depot, Wertpapiere und Anlage-CSV', icon: 'savings', color: '#a1c3ff' },
  ] },
  { title: 'Daten', links: [
    { page: 'accounts', name: 'Konten & Karten', hint: 'Bankkonten, Kartenkonten und Depots', icon: 'cards', color: '#8ebcff' },
    { page: 'expenses', name: 'Buchungen & Händler', hint: 'Ausgaben, Firmenlogos und Bank-CSV', icon: 'expenses', color: '#89dacd' },
    { page: 'sync', name: 'Geräte verbinden', hint: 'Frank auf PC und iPhone abgleichen', icon: 'devices', color: '#91d5db' },
    { page: 'data', name: 'Daten & Sicherung', hint: 'Backup, Wiederherstellung und KI-Zusammenfassung', icon: 'archive', color: '#aab3c9' },
  ] },
];

export function MorePage() {
  return <div className="fr-planning">
    <PageHeader title="Mehr" />
    <div className="fr-more-grid">
      {sections.map(section => <section key={section.title}>
        <h2 className="fr-planning-section">{section.title}</h2>
        <div className="fr-menu">{section.links.map(link => <a href={'#' + link.page} key={link.page}>
          <span className="fr-menu-icon" style={{color:link.color}}><FrankIcon name={link.icon} size={19} /></span>
          <span className="fr-menu-copy"><strong>{link.name}</strong><small>{link.hint}</small></span>
          <span className="fr-menu-arrow"><FrankIcon name="forward" size={16} /></span>
        </a>)}</div>
      </section>)}
    </div>
  </div>;
}
