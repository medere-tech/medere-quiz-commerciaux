import type { CSSProperties } from 'react';

/**
 * Jeu d'icônes unique du système : 24×24, trait 1,6, bouts arrondis.
 * Tracés repris à l'identique de `ui.jsx` du projet Claude Design.
 *
 * Un seul jeu, jamais mélangé avec un autre. Jamais un caractère
 * typographique en guise d'icône, jamais d'emoji.
 */
export const TRACES = {
  check: 'M4.5 12.5l4.5 4.5L19.5 6.5',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16.2 16.2L21 21',
  filter: 'M4 7h16M7 12h10M10 17h4',
  chevronRight: 'M9.5 5.5l7 6.5-7 6.5',
  chevronDown: 'M5.5 9.5l6.5 7 6.5-7',
  plus: 'M12 5v14M5 12h14',
  award: 'M12 3.5a5 5 0 100 10 5 5 0 000-10zM8.6 13.2L7 21l5-2.6L17 21l-1.6-7.8',
  target: 'M12 3v3M21 12h-3M12 21v-3M3 12h3M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z',
  refresh: 'M20 12a8 8 0 11-2.6-5.9M20 4v3.6h-3.6',
  users:
    'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3.5 3.5 0 010 6.6M18 14.8c1.9.7 3 2.5 3 5.2',
  chart: 'M4 20h16M7.5 20V11M12 20V5.5M16.5 20v-6',
  book: 'M5 4.5h6.5V20H5zM12.5 4.5H19V20h-6.5',
  table: 'M4 5.5h16v13H4zM4 10h16M10 10v8.5',
  pencil: 'M4.5 19.5l1-4 10-10 3 3-10 10zM14 6.5l3 3',
  trash: 'M5 7.5h14M9.5 7.5V5h5v2.5M7 7.5l1 12h8l1-12',
  eye: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zM12 9.4a2.6 2.6 0 100 5.2 2.6 2.6 0 000-5.2z',
  clock: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 7.5V12l3.5 2',
  play: 'M8 5.5l10 6.5-10 6.5z',
  alert: 'M12 4l8.5 15h-17zM12 10v4.2M12 16.6v.2',
  home: 'M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z',
  layers: 'M12 3.5l8 4.5-8 4.5-8-4.5zM4 13l8 4.5 8-4.5',
  upload: 'M12 16.5V4.5M7.5 9L12 4.5 16.5 9M4.5 19.5h15',
  presentation: 'M3.5 4.5h17M5 4.5v10h14v-10M12 14.5v3M8.5 20.5l3.5-3 3.5 3',
  logout: 'M10 4.5H5.5v15H10M15 8l4 4-4 4M9 12h10',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5V4.5h-11v11h4',
} as const;

export type NomIcone = keyof typeof TRACES;

type Props = {
  nom: NomIcone;
  taille?: number;
  couleur?: string;
  epaisseur?: number;
  style?: CSSProperties;
};

export function Icone({
  nom,
  taille = 20,
  couleur = 'currentColor',
  epaisseur = 1.6,
  style,
}: Props) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur}
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: 'none', ...style }}
      aria-hidden="true"
    >
      <path d={TRACES[nom]} />
    </svg>
  );
}
