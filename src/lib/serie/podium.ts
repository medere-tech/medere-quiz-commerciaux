import { doc, getDoc } from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/firestore';
import { clefDuJour, serieAffichee, type Assiduite } from '@/lib/serie/assiduite';

/**
 * Le podium de régularité, côté lecture.
 *
 * **L'écart assumé de l'écran 04b.** La maquette dessine un classement complet
 * de l'équipe sur le taux de maîtrise. On publie un podium sur la
 * **régularité**, et seulement les trois meilleures valeurs. Les deux raisons
 * sont au README, section « Récompenses et équipe » ; la plus courte est que
 * sur une équipe de dix, un classement complet expose ceux qui rament, et que
 * ce sont eux qui ont le plus besoin de l'outil.
 *
 * **Ce module ne calcule rien qu'il pourrait falsifier.** Le classement est
 * établi par la Cloud Function, seule à lire l'assiduité de tout le monde. Ici
 * on relit, et on refait une seule chose : **la péremption des séries**.
 */

/** Une ligne du podium, telle qu'elle est publiée. */
export type LignePodium = {
  uid: string;
  nom: string;
  avatar: string;
  rang: number;
  /** La série au moment du calcul, avant péremption. */
  serie: number;
  dernierJour: string;
};

export type Podium = {
  lignes: LignePodium[];
  /** Ceux qui tiennent le dernier rang nommé sans être nommés. */
  autresAuDernierRang: number;
};

/** Mon rang, lu dans un document que personne d'autre ne peut lire. */
export type MonRang = {
  rang: number;
  /** Jours à gagner pour entrer au podium. `null` pour qui y figure déjà. */
  ecart: number | null;
};

/**
 * La série d'une ligne du podium, telle qu'elle vaut aujourd'hui.
 *
 * **Une série se périme sans que personne n'écrive.** Le podium est recalculé
 * quand quelqu'un joue ; entre deux écritures, la série de celui qui s'est
 * arrêté continue de descendre. Sans ce recalcul, l'écran annoncerait
 * « 7 jours » pour quelqu'un qui n'a pas joué depuis trois semaines — et **un
 * nombre périmé vers le haut serait pire que pas de podium**.
 *
 * On ne réordonne pas pour autant : le rang vient du calcul serveur, qui seul
 * a vu toute l'équipe. Une ligne périmée affiche zéro et se lit comme telle.
 */
export function serieDuJour(ligne: LignePodium, maintenant = new Date()): number {
  const assiduite: Assiduite = {
    dernierJour: ligne.dernierJour,
    serie: ligne.serie,
    record: ligne.serie,
    semaine: [],
  };
  return serieAffichee(assiduite, clefDuJour(maintenant));
}

/**
 * Le podium publié.
 *
 * Une lecture, pas un écouteur : ce classement bouge au rythme d'une série par
 * personne et par jour. Un écouteur ferait changer l'écran sous les yeux pour
 * une information qui n'a aucune urgence.
 */
export async function chargerPodium(): Promise<Podium | null> {
  const instantane = await getDoc(doc(baseDeDonnees(), 'classements', 'regularite'));
  if (!instantane.exists()) return null;

  const donnees = instantane.data();
  const lignes = Array.isArray(donnees.lignes) ? (donnees.lignes as LignePodium[]) : [];

  return {
    lignes,
    autresAuDernierRang:
      typeof donnees.autresAuDernierRang === 'number' ? donnees.autresAuDernierRang : 0,
  };
}

/**
 * Mon rang, et ce qui me sépare du podium.
 *
 * **Les règles réservent cette lecture à son propriétaire**, et c'est ce qui
 * rend l'écran tenable : personne n'apprend le rang de personne. L'écart, lui,
 * se mesure contre la dernière valeur *nommée* — déjà affichée — donc il
 * n'apprend rien non plus.
 *
 * `null` veut dire « pas de rang » : série éteinte, ou moins de trois séries
 * vivantes dans l'équipe. Dans les deux cas l'écran se tait plutôt que
 * d'annoncer une place.
 */
export async function chargerMonRang(uid: string): Promise<MonRang | null> {
  const instantane = await getDoc(
    doc(baseDeDonnees(), 'classements', 'regularite', 'personnel', uid),
  );
  if (!instantane.exists()) return null;

  const donnees = instantane.data();
  if (typeof donnees.rang !== 'number') return null;

  return {
    rang: donnees.rang,
    ecart: typeof donnees.ecart === 'number' ? donnees.ecart : null,
  };
}

/** « 5e », « 1er ». */
export function rangAffiche(rang: number): string {
  return rang === 1 ? '1er' : `${rang}e`;
}

/**
 * Ce qu'on dit à quelqu'un qui n'est pas au podium.
 *
 * « 5e · deux jours de plus pour entrer au podium ». Le rang sans l'écart ne
 * dit pas quoi faire ; l'écart sans le rang ne dit pas où l'on est.
 */
export function phraseDuRang(mon: MonRang): string {
  if (mon.ecart === null) return rangAffiche(mon.rang);
  const jours = mon.ecart === 1 ? 'un jour' : `${mon.ecart} jours`;
  return `${rangAffiche(mon.rang)} · ${jours} de plus pour entrer au podium`;
}
