'use client';

import type { ReactNode } from 'react';

import { Coquille, NAVIGATION_ADMIN } from '@/composants/ds/Coquille';

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
      entrees={NAVIGATION_ADMIN}
      barreReduite={barreReduite}
    >
      {children}
    </Coquille>
  );
}
