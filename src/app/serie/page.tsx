import { Suspense } from 'react';

import { Serie } from '@/composants/parcours/Serie';
import { Squelettes } from '@/composants/ds/etats';

/** 02, 03 et 04 · La série, de la première question au décompte final. */
export default function PageSerie() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
          <Squelettes lignes={4} />
        </div>
      }
    >
      <Serie />
    </Suspense>
  );
}
