import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * Agrégation anonyme des réponses vers `questionStats`.
 *
 * **La règle qui tient tout.** Aucun identifiant d'utilisateur n'entre dans
 * `questionStats`. Ni `uid`, ni liste de participants, ni compteur par
 * personne. C'est ce qui rend l'anonymat structurel : Noémie voit quelles
 * questions font trébucher l'équipe, jamais qui trébuche. Les règles
 * interdisent déjà l'écriture cliente sur cette collection ; cette fonction
 * est le seul chemin d'écriture, et elle ne reçoit que deux valeurs — un
 * identifiant de question et un booléen.
 *
 * La signature ci-dessous est volontairement pauvre. Elle ne prend pas la
 * réponse, ni son chemin, ni l'événement : ce qu'on ne lui passe pas ne peut
 * pas fuiter dans l'agrégat.
 */

/** Documents de dédoublonnage, sous chaque agrégat. Invisibles aux clients :
 *  les règles ne déclarent aucun `match` pour cette sous-collection. */
const SOUS_COLLECTION_EVENEMENTS = 'evenements';

/** Durée de conservation d'un marqueur de dédoublonnage. Au-delà, plus aucun
 *  rejeu n'est possible : la fenêtre de reprise de Cloud Functions v2 est de
 *  24 heures. Sept jours laissent de la marge sans faire enfler la base. */
export const RETENTION_EVENEMENT_MS = 7 * 24 * 60 * 60 * 1000;

export type Agregation = {
  /** Identifiant de la question, seule clé de l'agrégat. */
  questionId: string;
  /** Verdict recalculé par les règles à l'écriture ; ici on le relit. */
  correcte: boolean;
  /**
   * Identifiant de l'événement, pour ne pas compter deux fois la même
   * réponse. Cloud Functions garantit une livraison *au moins une fois* :
   * même sans reprise sur erreur, un doublon reste possible, et un compteur
   * qui dérive discrédite tout l'écran.
   */
  evenementId: string;
};

/**
 * Ce qu'on accepte de lire dans un document de réponse. Le reste — `uid`
 * implicite dans le chemin, options choisies, horodatage — n'a rien à faire
 * dans l'agrégat et n'est donc pas extrait.
 */
export function lireReponse(donnees: unknown): { questionId: string; correcte: boolean } | null {
  if (typeof donnees !== 'object' || donnees === null) return null;

  const brut = donnees as Record<string, unknown>;
  const questionId = brut.questionId;
  const correcte = brut.correcte;

  if (typeof questionId !== 'string' || questionId.trim() === '') return null;
  if (typeof correcte !== 'boolean') return null;

  return { questionId, correcte };
}

/**
 * Vrai quand le compte appartient à l'équipe pédagogique.
 *
 * **Pourquoi les réponses des administrateurs restent hors de l'agrégat.**
 * Noémie doit pouvoir parcourir le quiz comme un commercial : c'est elle qui
 * écrit les explications affichées après chaque réponse, et sans les voir en
 * situation elle travaille à l'aveugle. Mais elle relit alors des questions
 * qu'elle vient d'écrire, donc elle y répond juste — et ferait baisser le taux
 * d'échec précisément des questions qu'elle inspecte. Le biais n'est pas
 * aléatoire, il est orienté, et il touche l'écran qui sert à décider quoi
 * réécrire. Avec dix commerciaux et un seuil d'affichage à trois réponses,
 * deux essais suffisent à faire apparaître une question sous un taux qu'elle a
 * elle-même fabriqué.
 *
 * **La décision vient du custom claim, jamais du client.** Un marqueur posé
 * par le navigateur laisserait n'importe quel commercial se retirer de
 * l'agrégat anonyme. Le claim est posé côté serveur, à partir de la liste
 * d'adresses en variable d'environnement : c'est la seule source qui fasse
 * autorité.
 *
 * **L'identifiant sert à décider, jamais à écrire.** `questionStats` continue
 * de ne porter aucun `uid` — voir l'en-tête de ce fichier, la règle est
 * inchangée.
 *
 * Ses réponses restent enregistrées sous son propre compte : sa progression,
 * ses questions à revoir, son historique. C'est ce qui rend l'aperçu fidèle.
 */
export function estAdministrateur(claims: unknown): boolean {
  if (typeof claims !== 'object' || claims === null) return false;
  return (claims as Record<string, unknown>).admin === true;
}

export type Resultat = 'agrege' | 'doublon';

/**
 * Incrémente l'agrégat d'une question, une seule fois par événement.
 *
 * La transaction lit d'abord le marqueur : s'il existe, l'événement a déjà
 * été traité et on ne touche à rien. Sinon elle pose le marqueur et
 * incrémente dans la même écriture atomique — les deux réussissent ensemble
 * ou échouent ensemble.
 */
export async function agreger(base: Firestore, entree: Agregation): Promise<Resultat> {
  const agregat = base.collection('questionStats').doc(entree.questionId);
  const marqueur = agregat.collection(SOUS_COLLECTION_EVENEMENTS).doc(entree.evenementId);

  return base.runTransaction(async (transaction) => {
    const dejaVu = await transaction.get(marqueur);
    if (dejaVu.exists) return 'doublon';

    transaction.set(marqueur, {
      expireLe: new Date(Date.now() + RETENTION_EVENEMENT_MS),
    });

    transaction.set(
      agregat,
      {
        tentatives: FieldValue.increment(1),
        echecs: FieldValue.increment(entree.correcte ? 0 : 1),
        majLe: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return 'agrege';
  });
}
