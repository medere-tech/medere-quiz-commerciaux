import { Suspense } from 'react';

import { Serie } from '@/composants/parcours/Serie';
import { Squelettes } from '@/composants/ds/etats';
import { monParcours } from '@/lib/serveur/donnees-privees';
import { etatsDesQuestions } from '@/lib/serie/etats';
import { chargerReferentielCompletSiConnecte } from '@/lib/serveur/referentiel';

/** 02, 03 et 04 · La série, de la première question au décompte final. */
export default async function PageSerie() {
  const [referentiel, parcours] = await Promise.all([
    chargerReferentielCompletSiConnecte(),
    monParcours(),
  ]);
  // Personne n'est connecté : la disposition rend l'écran de connexion, et
  // ce que cette page renvoie est écarté. On ne charge donc rien.
  if (!referentiel) return null;

  return (
    <Suspense
      fallback={
        <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
          <Squelettes lignes={4} />
        </div>
      }
    >
      <Serie
        referentiel={referentiel}
        parcours={{
          uid: parcours.uid,
          progression: parcours.progression,
          etats: etatsDesQuestions(
            referentiel.questions.map((question) => question.id),
            parcours.etats,
          ),
        }}
      />
    </Suspense>
  );
}
