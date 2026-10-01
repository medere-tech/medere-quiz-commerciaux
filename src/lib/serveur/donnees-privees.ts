import 'server-only';

import { exigerSession } from '@/lib/auth/session-serveur';
import { firestoreAdmin } from '@/lib/firebase/admin';
import { enAssiduite } from '@/lib/serie/assiduite';
import type { EtatComplet, Progression } from '@/lib/serie/depot';
import { enEtatComplet } from '@/lib/serie/etats';

/**
 * Les données privées d'un commercial, lues au serveur.
 *
 * **C'est une décision de sécurité, prise le 21 septembre 2026, et pas une
 * optimisation faite en passant.** Elle avait été refusée au lot 8 sur une
 * estimation de 300 ms — à juste titre : on n'échange pas une garantie de base
 * contre un tiers de seconde. Le coût réel, mesuré depuis sur un écran
 * authentifié avec une vraie session de navigateur, est de **8,6 secondes**
 * entre le clic et la donnée. La décision se repose à ce niveau-là. Le détail
 * chiffré est au README.
 *
 * **Ce qui change, dit sans détour.** Ces lectures ne passent plus par les
 * règles Firestore : le SDK Admin les contourne toutes. La garantie qui les
 * protégeait était donnée par la base ; elle est maintenant donnée par ce
 * fichier.
 *
 * **Ce qui ne change pas, et qui compte le plus.** Les écritures restent au
 * navigateur, sous les règles : `etoiles` ne peut toujours que monter de 0 à 3
 * par écriture, un verdict est toujours recalculé par la base, une réponse est
 * toujours signée par son auteur. **C'est là qu'un score se forge**, et rien de
 * cela ne bouge.
 *
 * **L'invariant qui borne la perte, et qui est vérifié à chaque exécution :**
 *
 * 1. `server-only` — ce module ne peut pas être empaqueté pour le navigateur.
 * 2. **Aucune fonction exportée ne prend d'identifiant.** L'uid vient
 *    d'`exigerSession()`, qui vérifie le cookie. On ne peut donc pas *nommer*
 *    quelqu'un d'autre : il n'y a pas d'argument pour le dire.
 * 3. **Aucun chemin hors de `users/{uid}`.** Une seule fonction compose les
 *    chemins, et elle les préfixe toujours de la session.
 *
 * Les points 2 et 3 sont gardés par `tests/serveur/donnees-privees.test.ts`,
 * qui lit ce fichier et refuse un export qui prendrait un paramètre ou un
 * chemin qui sortirait du sous-arbre. Un invariant qu'on peut exécuter n'est
 * pas une promesse.
 */

/** La racine des données de la personne connectée, et la seule qui existe. */
async function monDocument() {
  const session = await exigerSession();
  return { uid: session.uid, racine: firestoreAdmin().collection('users').doc(session.uid) };
}

function enRecompenses(valeur: unknown): Record<string, string> {
  if (!valeur || typeof valeur !== 'object') return {};
  const obtenues: Record<string, string> = {};
  for (const [identifiant, jour] of Object.entries(valeur as Record<string, unknown>)) {
    if (typeof jour === 'string') obtenues[identifiant] = jour;
  }
  return obtenues;
}

/**
 * Ce que le parcours a besoin de savoir de son propre historique.
 *
 * Les deux lectures partent ensemble : elles ne dépendent pas l'une de
 * l'autre, et les enchaîner doublerait l'attente — même raison qu'au client,
 * dont ce module reprend le contrat mot pour mot.
 */
export async function monParcours(): Promise<{
  uid: string;
  etats: Map<string, EtatComplet>;
  progression: Progression;
}> {
  const { uid, racine } = await monDocument();

  const [instantaneEtats, document] = await Promise.all([
    racine.collection('etats').get(),
    racine.get(),
  ]);

  const etats = new Map<string, EtatComplet>();
  for (const etat of instantaneEtats.docs) {
    etats.set(etat.id, enEtatComplet(etat.id, etat.data()));
  }

  const brut = document.data() ?? {};

  return {
    uid,
    etats,
    progression: {
      etoiles: typeof brut.etoiles === 'number' ? brut.etoiles : 0,
      seriesTerminees: typeof brut.seriesTerminees === 'number' ? brut.seriesTerminees : 0,
      assiduite: enAssiduite(brut.assiduite),
      recompenses: enRecompenses(brut.recompenses),
    },
  };
}
