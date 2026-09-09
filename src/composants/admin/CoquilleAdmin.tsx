'use client';

import type { ReactNode } from 'react';

import { Coquille, NAVIGATION_ADMIN, type Bascule } from '@/composants/ds/Coquille';

/**
 * Le passage vers le parcours, tel que Noémie le voit depuis le back-office.
 * `eye` plutôt que `play` : elle regarde ce que voient les commerciaux, elle
 * ne lance pas une série pour elle-même.
 */
const VERS_LE_PARCOURS: Bascule = {
  route: '/',
  libelle: 'Voir le parcours',
  icone: 'eye',
};

/**
 * Coquille du back-office : la coquille commune, avec la navigation
 * pédagogique. Le repli, le tiroir et le piège de focus vivent une seule fois,
 * dans `Coquille` — le parcours commercial s'appuie sur la même.
 */
export function CoquilleAdmin({
  nom,
  barreReduite,
  children,
}: {
  nom: string;
  barreReduite?: 'auto' | 'reduite' | 'etendue';
  children: ReactNode;
}) {
  return (
    <Coquille
      nom={nom}
      role="Responsable pédagogique"
      contexte="Back-office"
      entrees={NAVIGATION_ADMIN}
      bascule={VERS_LE_PARCOURS}
      barreReduite={barreReduite}
    >
      {children}
    </Coquille>
  );
}
