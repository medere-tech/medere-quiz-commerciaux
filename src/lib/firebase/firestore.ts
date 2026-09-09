import { getFirestore, type Firestore } from 'firebase/firestore';

import { applicationFirebase } from '@/lib/firebase/client';

/**
 * Accès à Firestore côté navigateur.
 *
 * **Pourquoi ce module existe, alors qu'il tient en trois lignes.** Cette
 * fonction vivait dans `client.ts`, qui importait donc `firebase/firestore`
 * au niveau du module. Or `client.ts` est aussi le chemin d'accès à
 * l'authentification : l'écran de connexion, qui ne veut que
 * `signInWithPopup`, embarquait tout Firestore dans son fragment.
 *
 * Rien ne s'exécutait — c'était un défaut de graphe de modules, pas de code
 * mort à l'exécution — mais le poids, lui, était bien téléchargé. Sortir la
 * fonction ici suffit à ce que seuls les quatre dépôts qui interrogent la
 * base tirent Firestore.
 *
 * Aucune conséquence de sécurité : ni les règles, ni l'attestation App Check,
 * ni l'isolation des scores ne dépendent de l'endroit où une fonction est
 * déclarée. `applicationFirebase()` démarre App Check comme avant, quel que
 * soit l'appelant.
 */
export function baseDeDonnees(): Firestore {
  return getFirestore(applicationFirebase());
}
