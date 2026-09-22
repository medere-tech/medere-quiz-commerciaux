/**
 * Pose `verrouillee` sur les séances qui n'en portent pas.
 *
 * **Pourquoi ce script existe.** `verrouillee` — la porte de la salle, lot 15 —
 * est entré dans `champsSession()`, que les règles lisent avec `hasOnly` **et**
 * `hasAll`. Ces deux clauses portent sur l'état d'après fusion : **une séance
 * composée avant ce champ ne se met donc plus à jour du tout**. Ni lancer, ni
 * mettre en pause, ni arrêter. L'écran d'animation refuse tout, et le refus
 * ressemble à une panne.
 *
 * C'est la politique assumée de `CLAUDE.md` — la base ne contient que de la
 * recette, et on ne rend pas un champ facultatif pour ménager des documents
 * jetables. Mais entre effacer la recette et poser un booléen, poser le
 * booléen est proportionné : `tests/regles/verrou.test.ts` vérifie que la
 * séance redevient pilotable après cette seule écriture.
 *
 * **Il n'écrit qu'un champ, et jamais deux fois.** Les séances qui le portent
 * déjà sont laissées telles quelles — y compris celles qui sont verrouillées,
 * qu'il serait faux de rouvrir au passage. Rejouable sans effet de bord.
 *
 * Usage :
 *   node --env-file=.env.local scripts/completer-sessions.ts
 *   node --env-file=.env.local scripts/completer-sessions.ts --faire
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const ECRITURES_PAR_LOT = 400;

/**
 * Les champs qu'une séance doit porter, recopiés de `champsSession()` dans
 * `firestore.rules`.
 *
 * **Recopiés, et c'est un défaut assumé** : les règles ne s'importent pas. Le
 * script s'en sert pour *constater*, jamais pour écrire autre chose que
 * `verrouillee` — si cette liste dérivait, on le verrait comme un champ
 * manquant de plus à l'essai à blanc, pas comme une écriture sauvage.
 */
const CHAMPS_SESSION = [
  'code', 'titre', 'description', 'animateurNom', 'questionIds',
  'indexCourant', 'revelee', 'demarree', 'verrouillee', 'statut',
  'animateurUid', 'creeeLe', 'ouverteLe', 'termineeLe',
  'presentsFinal', 'effectifAttendu', 'repartition', 'repondants',
  'dureeQuestionSecondes', 'questionOuverteLe',
];

function base(): Firestore {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST est défini : ce script vise la base réelle, ' +
        'pas l’émulateur. Retirez la variable et relancez.',
    );
  }

  return getFirestore(
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      }),
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    }),
  );
}

async function principal(): Promise<void> {
  const faire = process.argv.includes('--faire');
  const firestore = base();

  const instantane = await firestore.collection('sessions').get();
  const aCompleter: { id: string; statut: string; titre: string }[] = [];
  const autresEcarts: string[] = [];
  let dejaJustes = 0;

  for (const document of instantane.docs) {
    const donnees = document.data();
    const manquants = CHAMPS_SESSION.filter((champ) => !(champ in donnees));
    const enTrop = Object.keys(donnees).filter((champ) => !CHAMPS_SESSION.includes(champ));

    /*
     * **Ce que le script ne sait pas réparer, il le nomme.** Un champ manquant
     * autre que `verrouillee`, ou un champ en trop, bloque la séance pour la
     * même raison — `hasAll` et `hasOnly` — et demande une décision, pas une
     * valeur par défaut. C'est ainsi qu'on a vu que `verrouillee` n'était pas
     * le premier champ devenu obligatoire, seulement le dernier.
     */
    const restants = manquants.filter((champ) => champ !== 'verrouillee');
    if (restants.length > 0 || enTrop.length > 0) {
      autresEcarts.push(
        `  ${document.id}  manque : ${restants.join(', ') || '—'}` +
          `  en trop : ${enTrop.join(', ') || '—'}`,
      );
    }

    if (manquants.includes('verrouillee')) {
      aCompleter.push({
        id: document.id,
        statut: String(donnees.statut ?? '?'),
        titre: typeof donnees.titre === 'string' && donnees.titre !== '' ? donnees.titre : '—',
      });
    } else {
      dejaJustes += 1;
    }
  }

  console.log(
    `${instantane.size} séance(s) : ${dejaJustes} déjà à jour, ` +
      `${aCompleter.length} à compléter.`,
  );

  /*
   * On nomme celles qu'on touche, avec leur état : une séance encore ouverte
   * est celle qui bloque l'écran d'animation, et c'est elle qu'on vient
   * débloquer. Le savoir avant d'écrire vaut mieux qu'un compte.
   */
  for (const { id, statut, titre } of aCompleter) {
    console.log(`  ${id}  ${statut.padEnd(11)} ${titre}`);
  }

  if (autresEcarts.length > 0) {
    console.log(
      `\nATTENTION — ${autresEcarts.length} séance(s) portent un autre écart au modèle.`,
    );
    console.log('Poser « verrouillee » ne suffira pas à les débloquer :');
    for (const ligne of autresEcarts) console.log(ligne);
  }

  if (!faire) {
    console.log('\n(essai à blanc — ajouter --faire pour écrire)');
    return;
  }

  for (let debut = 0; debut < aCompleter.length; debut += ECRITURES_PAR_LOT) {
    const lot = firestore.batch();
    for (const { id } of aCompleter.slice(debut, debut + ECRITURES_PAR_LOT)) {
      // Faux, et pas vrai : une séance qu'on répare n'a jamais été verrouillée.
      lot.update(firestore.collection('sessions').doc(id), { verrouillee: false });
    }
    await lot.commit();
  }

  console.log(`\n${aCompleter.length} séance(s) complétée(s).`);
}

await principal();
