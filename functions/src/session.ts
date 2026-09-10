import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * Compteur de réponses d'une session collective.
 *
 * **Le problème qu'il résout.** L'écran du participant montre « 9 réponses sur
 * 10 » et le voit monter pendant qu'il attend : c'est la tension de
 * l'exercice. Mais un participant ne peut pas compter lui-même — les réponses
 * de session ne sont listables que par l'animatrice, décision du lot 1, et
 * c'est ce qui garantit qu'il ne voit pas qui a répondu quoi.
 *
 * Trois chemins étaient possibles, deux sont mauvais :
 *
 * - **Ouvrir la liste des réponses aux participants.** Cela reviendrait à
 *   publier qui a répondu quoi pour afficher un nombre. Non.
 * - **Laisser l'animatrice écrire le compteur à chaque réponse reçue.** Le
 *   compteur dépendrait alors de son onglet : elle le ferme, le nombre se fige
 *   pour tout le monde. Or tout l'état de la séance doit vivre dans Firestore,
 *   pas dans un navigateur — c'est ce qui permet qu'elle rouvre son onglet sans
 *   rien perdre.
 * - **Compter côté serveur.** C'est ce qu'on fait ici : personne n'a besoin de
 *   droits supplémentaires, le nombre est vrai même si tous les onglets se
 *   ferment, et un participant ne peut pas le gonfler.
 *
 * **Ce déclencheur n'agrège rien.** Le lot 6 avait prévu un second déclencheur
 * sur cette collection pour alimenter `questionStats` ; c'était une erreur, et
 * le commentaire de `index.ts` la corrige. Une réponse de session est écrite
 * dans deux documents par le participant lui-même, dont un sous
 * `users/{uid}/reponses` : agréger ici compterait chaque réponse deux fois.
 */

/** Ce qu'on lit d'une session pour décider s'il faut compter. */
export type EtatSession = {
  statut?: unknown;
  revelee?: unknown;
  indexCourant?: unknown;
  questionIds?: unknown;
};

/**
 * Vrai quand la réponse reçue porte sur la question actuellement ouverte.
 *
 * **Pourquoi ce n'est pas un simple incrément.** Le compteur est remis à zéro
 * quand l'animatrice passe à la question suivante. Une réponse partie juste
 * avant ce passage peut arriver juste après : sans ce contrôle, elle ferait
 * démarrer la question suivante à « 1 réponse », et personne ne comprendrait
 * d'où elle sort. On compare donc la question de la réponse à celle qui est
 * ouverte, et on laisse tomber ce qui a raté le coche.
 */
export function doitCompter(session: EtatSession, questionId: string): boolean {
  if (session.statut !== 'encours') return false;
  if (session.revelee !== false) return false;

  const { indexCourant, questionIds } = session;
  if (typeof indexCourant !== 'number' || !Array.isArray(questionIds)) return false;

  return questionIds[indexCourant] === questionId;
}

/**
 * Incrémente le compteur de la session, une fois, si la réponse concerne bien
 * la question ouverte. La transaction relit la session : entre l'arrivée de
 * l'événement et l'écriture, l'animatrice a pu révéler ou passer à la suite.
 */
export async function compterReponse(
  base: Firestore,
  sessionId: string,
  questionId: string,
): Promise<'compte' | 'ignore'> {
  const session = base.collection('sessions').doc(sessionId);

  return base.runTransaction(async (transaction) => {
    const instantane = await transaction.get(session);
    if (!instantane.exists) return 'ignore';

    if (!doitCompter(instantane.data() as EtatSession, questionId)) return 'ignore';

    transaction.update(session, { repondants: FieldValue.increment(1) });
    return 'compte';
  });
}
