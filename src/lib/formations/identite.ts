import type { Formation } from '@/lib/formations/lecture';
import { ID_FORMATION_TRANSVERSE } from '@/lib/formations/transverse';

/*
 * **Un module pur, sans SDK.** Cette fonction vivait dans `depot.ts`, qui importe
 * le SDK Firestore : tout écran qui voulait la forme d'une formation
 * l'embarquait avec lui, et un composant serveur ne pouvait pas l'appeler du
 * tout. Elle ne lit rien — elle dérive une forme d'un public.
 */

/**
 * Teinte et forme de la marque associées à une formation, dérivées de son
 * public. Le repère d'une formation est sa forme, jamais une puce colorée —
 * c'est une règle du système de design, pas une préférence.
 *
 * Les sept formes sont celles du système, livrées déjà teintées, dans
 * `public/formes/`.
 */
const IDENTITES: Record<string, { fichier: string; couleur: string }> = {
  'médecin généraliste': { fichier: 'forme-1-006E90.svg', couleur: 'var(--specialty-general)' },
  'chirurgien dentiste': { fichier: 'forme-2-FECA45.svg', couleur: 'var(--specialty-dentist)' },
  pédiatre: { fichier: 'forme-3-17BEBB.svg', couleur: 'var(--specialty-pediatrician)' },
  radiologue: { fichier: 'forme-4-F19953.svg', couleur: 'var(--specialty-radiologist)' },
  gynécologue: { fichier: 'forme-5-D87DA9.svg', couleur: 'var(--specialty-gynecologist)' },
  psychiatre: { fichier: 'forme-6-9F84BD.svg', couleur: 'var(--specialty-psychiatrist)' },
  autres: { fichier: 'forme-7-2DA131.svg', couleur: 'var(--specialty-others)' },
};

const IDENTITE_PAR_DEFAUT = IDENTITES['médecin généraliste'] as {
  fichier: string;
  couleur: string;
};

/**
 * La formation transverse n'a pas de public : elle prendrait la forme par
 * défaut, celle du médecin généraliste, que portent déjà cent formations.
 *
 * **Choix provisoire, à trancher par le design.** Les sept formes du jeu sont
 * toutes employées par au moins une formation active. On retient donc le
 * couple le moins confondable parmi ceux que le dépôt contient déjà : la
 * forme 5, portée par une seule formation active (en rose), déclinée en
 * jaune — `forme-5-FECA45`, jusqu'ici décor de l'écran de fin de série.
 */
const IDENTITE_TRANSVERSE = { fichier: 'forme-5-FECA45.svg', couleur: 'var(--specialty-dentist)' };

export function identiteVisuelle(formation: Formation): { fichier: string; couleur: string } {
  if (formation.id === ID_FORMATION_TRANSVERSE) return IDENTITE_TRANSVERSE;
  const premiere = (formation.cibles[0] ?? '').toLowerCase();
  return IDENTITES[premiere] ?? IDENTITE_PAR_DEFAUT;
}
