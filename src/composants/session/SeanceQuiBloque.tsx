'use client';

import { Carte, Meta } from '@/composants/ds/primitives';
import { ArreterSeance } from '@/composants/session/ArreterSeance';
import { titreDeSeance } from '@/lib/session/seance';
import type { Session } from '@/lib/session/depot';

/**
 * « Une séance est déjà en cours » — et de quoi la clore, ici même.
 *
 * **Pourquoi refuser plutôt que clore tout seul.** Lancer une séance pendant
 * qu'une autre tourne laissait deux séances vivantes : un code qui traîne
 * reste rejoignable, et l'écran d'animation devait deviner laquelle ouvrir.
 * Clore la précédente automatiquement aurait réglé ça — mais on ne termine pas
 * une séance sans que personne ne l'ait demandé : le classement partirait avec.
 * On refuse donc, on nomme celle qui bloque, et on met les deux issues à
 * portée.
 *
 * **Le geste ne renvoie pas ailleurs.** Un refus qui dirait « allez fermer la
 * précédente dans l'autre écran » ferait perdre ce qu'on venait de composer,
 * et Noémie reviendrait de toute façon ici. Le panneau d'`ArreterSeance` — le
 * même que sur la scène et dans la salle d'attente, avec ses deux issues et
 * leurs conséquences écrites — est rendu directement.
 *
 * **Ce n'est pas une garantie, c'est un garde-fou.** Les règles ne peuvent pas
 * interdire deux séances vivantes : il faudrait interroger la collection
 * depuis une règle, ce que Firestore ne permet pas. Un client modifié
 * passerait outre. Ce qui est tenu ici, c'est le geste ordinaire.
 *
 * **Ajout hors maquette.** Construit avec `Carte`, `Meta` et le panneau
 * existant, sans composant ni couleur inventés.
 */
export function SeanceQuiBloque({
  seance,
  onTerminer,
  onAbandonner,
}: {
  /** Celle qui tourne, et qu'il faut clore avant d'en lancer une autre. */
  seance: Session;
  onTerminer: () => void;
  onAbandonner: () => void;
}) {
  return (
    <Carte
      rayon="var(--radius-lg)"
      rembourrage="14px 16px"
      elevation="aucune"
      /* Bordure complète et fond teinté, jamais un filet d'un seul côté.
         Teinte dérivée de `--status-warning` : ce n'est pas un danger, c'est
         un obstacle nommé. */
      style={{
        marginTop: 'var(--space-4)',
        border: '1px solid rgba(254, 202, 69, 0.6)',
        background: 'rgba(254, 202, 69, 0.14)',
      }}
    >
      <span
        role="status"
        style={{
          display: 'block',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
          textWrap: 'pretty',
        }}
      >
        Une séance est déjà en cours : « {titreDeSeance(seance)} »
      </span>

      <Meta style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
        Deux séances ouvertes en même temps se disputent l’écran d’animation, et
        l’ancien code reste rejoignable. Terminez-la ou abandonnez-la, puis relancez.
      </Meta>

      <span style={{ display: 'block', marginTop: 'var(--space-4)' }}>
        <ArreterSeance
          presentation="liste"
          onTerminer={onTerminer}
          onAbandonner={onAbandonner}
          questionsJouees={seance.demarree ? seance.indexCourant + 1 : 0}
          questionsTotal={seance.questionIds.length}
        />
      </span>
    </Carte>
  );
}
