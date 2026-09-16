'use client';

import { useEffect } from 'react';

import { signalerPanne } from '@/lib/journal/client';

/**
 * Les pannes qu'aucune frontière React n'attrape.
 *
 * **C'est la moitié qui compte.** Une frontière d'erreur ne voit que ce qui
 * lève pendant un rendu. Tout le reste lui échappe : un gestionnaire de clic,
 * un effet, une promesse rejetée, un écouteur Firestore qui casse. Les trois
 * défauts trouvés en séance réelle au lot 7 — chronomètre figé, question non
 * rafraîchie, réponse perdue au rechargement — vivaient tous dans cette
 * moitié-là.
 *
 * Deux écouteurs, posés une fois, au niveau du document :
 *
 *   - `error` — les exceptions non rattrapées, y compris celles des
 *     gestionnaires d'événements ;
 *   - `unhandledrejection` — les promesses rejetées sans `catch`, cas le plus
 *     fréquent dans du code asynchrone qui parle à Firestore.
 *
 * **Ce composant ne rend rien et ne bloque rien.** Il est monté par la
 * disposition racine, donc présent sur tous les écrans, écran de connexion
 * compris — une panne au moment de se connecter est précisément celle qu'on ne
 * voit jamais.
 */
export function SondeErreurs() {
  useEffect(() => {
    const surErreur = (evenement: ErrorEvent) => {
      /*
       * Une ressource qui ne charge pas — une police, une image — déclenche un
       * `error` sans `error.message`. Ce n'est pas une panne de code, et la
       * distinguer évite de remplir le journal de bruit réseau.
       */
      if (!evenement.error) {
        signalerPanne('ressource', new Error(evenement.message || 'Ressource non chargée'));
        return;
      }
      signalerPanne('globale', evenement.error);
    };

    const surRejet = (evenement: PromiseRejectionEvent) => {
      signalerPanne('promesse', evenement.reason);
    };

    window.addEventListener('error', surErreur);
    window.addEventListener('unhandledrejection', surRejet);

    return () => {
      window.removeEventListener('error', surErreur);
      window.removeEventListener('unhandledrejection', surRejet);
    };
  }, []);

  return null;
}
