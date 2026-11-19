import type { ReactNode } from 'react';

const shapes = {
  overview: <><rect x="3" y="3" width="7.5" height="10" rx="1.7" /><rect x="14.5" y="3" width="6.5" height="6" rx="1.6" /><rect x="3" y="16.5" width="7.5" height="4.5" rx="1.4" /><rect x="14.5" y="12.5" width="6.5" height="8.5" rx="1.6" /></>,
  budget: <><path d="M20 8H6a2 2 0 0 1 0-4l12-1v5M4 6v12a2 2 0 0 0 2 2h14V8" /><path d="M20 12h-4a2 2 0 0 0 0 4h4" /></>,
  expenses: <><path d="m5 3 2.2 1.4L9.6 3 12 4.4 14.4 3l2.4 1.4L19 3v18l-2.2-1.4-2.4 1.4-2.4-1.4L9.6 21l-2.4-1.4L5 21Z" /><path d="M8.5 9h7M8.5 13h5" /></>,
  savings: <><path d="m3 16 6-6 4 4 8-9M15 5h6v6" /></>,
  more: <><circle cx="4.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19.5" cy="12" r="1.2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M7.5 3v4m9-4v4m-13 3.5h17" /></>,
  calculator: <><rect x="5" y="2.5" width="14" height="19" rx="2" /><path d="M8 7h8M8.5 12h1m4 0h1m-6 4h1m4 0h1" /></>,
  repeat: <path d="m16 2 4 4-4 4M4 11V9a3 3 0 0 1 3-3h13M8 22l-4-4 4-4m12-1v2a3 3 0 0 1-3 3H4" />,
  reserve: <><rect x="3.5" y="6" width="17" height="13" rx="3" /><path d="M6.5 6V4.5h11V6m-8 6h5" /></>,
  cards: <><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M3 10h18M6 15h4" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9M10 13h4" /></>,
  home: <><path d="m2.5 10 9.5-7.5 9.5 7.5M5.5 8v12h13V8M9.5 20v-7h5v7" /></>,
  shield: <><path d="M12 2.5 20 6v5c0 5-3.6 8.1-8 10.5C7.6 19.1 4 16 4 11V6z" /><path d="m8.5 11.5 2.2 2.3 4.7-5" /></>,
  forward: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  back: <path d="m14.5 5-7 7 7 7" />,
} satisfies Record<string, ReactNode>;

export function FrankIcon({ name, size = 21 }: { name: keyof typeof shapes; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}
