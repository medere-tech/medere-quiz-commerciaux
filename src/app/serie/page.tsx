import { Suspense } from 'react';

import { Serie } from '@/composants/parcours/Serie';
import { Squelettes } from '@/composants/ds/etats';
import { chargerReferentiel } from '@/lib/serveur/referentiel';

/** 02, 03 et 04 · La série, de la première question au décompte final. */
export default async function PageSerie() {
  const referentiel = await chargerReferentiel();

  return (
    <Suspense
      fallback={
        <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
          <Squelettes lignes={4} />
        </div>
      }
    >
      <Serie referentiel={referentiel} />
    </Suspense>
  );
}
