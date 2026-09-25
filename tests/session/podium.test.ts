import { describe, expect, it } from 'vitest';

import {
  calculerClassement,
  calculerPodium,
  nomPubliable,
  serieContinue,
  serieDuJour,
  PLAFOND_NOMMES,
  SERIES_MINIMUM,
  type Regularite,
} from '../../functions/src/podium';

/**
 * Le podium de régularité — ce qu'il nomme, et surtout ce qu'il tait.
 *
 * **Ces règles ne sont pas des préférences d'affichage, ce sont les garde-fous
 * de confidentialité de l'écran 04b.** La maquette dessine un classement
 * complet sur le taux de maîtrise ; on construit un podium sur la régularité.
 * Chaque seuil ci-dessous répond à une façon précise de reconstituer par
 * soustraction ce qu'on refuse d'afficher.
 *
 * **Les tests vivent ici et non dans `functions/`** parce que la suite du
 * dépôt les exécute à chaque `npm test` : une logique de confidentialité qui
 * ne tournerait qu'au déploiement des fonctions ne serait vérifiée qu'un jour
 * sur dix.
 */

const LUNDI = '2026-09-21';
const MARDI = '2026-09-22';
const MERCREDI = '2026-09-23';

function qui(uid: string, serie: number, dernierJour = MERCREDI): Regularite {
  return { uid, nom: uid, avatar: 'bleu', serie, dernierJour };
}

/** Une équipe où tout le monde a joué aujourd'hui, aux séries indiquées. */
function equipe(...series: number[]): Regularite[] {
  return series.map((serie, rang) => qui(`u${rang}`, serie));
}

describe('la péremption d’une série', () => {
  it('tient du vendredi au lundi : le week-end ne rompt rien', () => {
    // 2026-09-18 est un vendredi, 2026-09-21 le lundi suivant.
    expect(serieContinue('2026-09-18', '2026-09-21')).toBe(true);
  });

  it('se rompt du vendredi au mardi : le lundi a été manqué', () => {
    expect(serieContinue('2026-09-18', '2026-09-22')).toBe(false);
  });

  /*
   * **Une série se périme sans que personne n'écrive.** C'est pour ça que le
   * podium ne peut pas se contenter de la valeur stockée : elle annoncerait
   * « 7 jours » pour quelqu'un qui n'a pas joué depuis trois semaines.
   */
  it('rend zéro pour une série abandonnée il y a trois semaines', () => {
    expect(serieDuJour(qui('u', 7, '2026-09-01'), MERCREDI)).toBe(0);
  });

  it('garde la série de quelqu’un qui a joué hier', () => {
    expect(serieDuJour(qui('u', 7, MARDI), MERCREDI)).toBe(7);
  });

  it('rend zéro pour quelqu’un qui n’a jamais joué', () => {
    expect(serieDuJour(qui('u', 0, ''), MERCREDI)).toBe(0);
  });
});

describe('le podium', () => {
  it('nomme les trois premiers, du plus régulier au moins', () => {
    const podium = calculerPodium(equipe(7, 5, 3), MERCREDI);

    expect(podium.lignes.map((ligne) => ligne.serie)).toEqual([7, 5, 3]);
    expect(podium.lignes.map((ligne) => ligne.rang)).toEqual([1, 2, 3]);
  });

  /*
   * **Le seuil que Déthié n'avait pas vu, et qui est le plus important.**
   * Lundi matin, deux personnes ont joué et huit non. Nommer les deux dit
   * implicitement que les huit autres sont à zéro : sur une équipe de dix,
   * c'est le classement complet par soustraction.
   */
  it('ne montre rien tant que moins de trois séries sont vivantes', () => {
    expect(calculerPodium(equipe(9, 4), MERCREDI).lignes).toEqual([]);
    expect(calculerPodium([qui('seul', 12)], MERCREDI).lignes).toEqual([]);
  });

  it('apparaît dès la troisième série vivante', () => {
    expect(calculerPodium(equipe(9, 4, 1), MERCREDI).lignes).toHaveLength(SERIES_MINIMUM);
  });

  /* Une série à zéro n'est jamais nommée : un zéro est une absence, pas une
     performance — et le nommer reviendrait à afficher qui ne joue pas. */
  it('ne nomme jamais une série à zéro, même s’il reste de la place', () => {
    const podium = calculerPodium(
      [qui('a', 5), qui('b', 3), qui('c', 2), qui('d', 7, '2026-08-01'), qui('e', 0, '')],
      MERCREDI,
    );

    expect(podium.lignes.map((ligne) => ligne.uid)).toEqual(['a', 'b', 'c']);
  });

  it('classe sur la série du jour, pas sur la valeur stockée', () => {
    // `d` a la plus grosse série stockée, mais elle est périmée.
    const podium = calculerPodium(
      [qui('a', 5), qui('b', 3), qui('c', 2), qui('d', 20, '2026-08-01')],
      MERCREDI,
    );

    expect(podium.lignes[0]?.uid).toBe('a');
    expect(podium.lignes.some((ligne) => ligne.uid === 'd')).toBe(false);
  });

  /* Le client recalcule la péremption à la lecture : il lui faut la date. */
  it('publie la date du dernier jour, pour que le client refasse le calcul', () => {
    const podium = calculerPodium(equipe(7, 5, 3), MERCREDI);

    expect(podium.lignes[0]?.dernierJour).toBe(MERCREDI);
  });
});

describe('les ex æquo', () => {
  /*
   * **Le rang se partage, et c'est un choix.** Départager trois personnes à
   * quatre jours aurait demandé d'inventer une hiérarchie là où il n'y en a
   * pas — et sur une équipe de dix, trois à quatre jours est le cas courant.
   */
  it('partage le rang, et saute les suivants', () => {
    const podium = calculerPodium(equipe(4, 4, 4, 2), MERCREDI);

    expect(podium.lignes.map((ligne) => ligne.rang)).toEqual([1, 1, 1, 4]);
  });

  it('montre les trois meilleures valeurs, pas les trois premières personnes', () => {
    const podium = calculerPodium(equipe(7, 5, 5, 3, 1), MERCREDI);

    expect(podium.lignes.map((ligne) => ligne.serie)).toEqual([7, 5, 5, 3]);
    expect(podium.lignes.some((ligne) => ligne.serie === 1)).toBe(false);
  });

  /*
   * **Le plafond ne coupe pas au milieu d'un rang.** Nommer trois personnes
   * sur sept à égalité serait arbitraire ; on retire le groupe entier et on
   * le compte.
   */
  it('compte sans nommer quand le dernier rang ferait déborder', () => {
    const podium = calculerPodium(equipe(9, 7, 4, 4, 4, 4, 4), MERCREDI);

    expect(podium.lignes.map((ligne) => ligne.serie)).toEqual([9, 7]);
    expect(podium.autresAuDernierRang).toBe(5);
  });

  it('nomme tout le monde tant qu’on tient sous le plafond', () => {
    const podium = calculerPodium(equipe(9, 7, 4, 4, 4, 4), MERCREDI);

    expect(podium.lignes).toHaveLength(PLAFOND_NOMMES);
    expect(podium.autresAuDernierRang).toBe(0);
  });
});

describe('le rang personnel', () => {
  it('ne donne aucun écart à qui figure déjà au podium', () => {
    const { rangs } = calculerClassement(equipe(7, 5, 3), MERCREDI);

    expect(rangs).toEqual([
      { uid: 'u0', rang: 1, ecart: null },
      { uid: 'u1', rang: 2, ecart: null },
      { uid: 'u2', rang: 3, ecart: null },
    ]);
  });

  /*
   * **L'écart se mesure contre la dernière valeur du podium, et jamais contre
   * le voisin immédiat.** C'est toute la différence : l'écart au voisin,
   * combiné à sa propre série, livrerait la série de quelqu'un que l'écran ne
   * nomme pas. La dernière valeur nommée, elle, est déjà affichée — l'écart
   * n'est plus qu'une soustraction entre deux nombres publics.
   *
   * Ici le podium nomme 9, 7 et 5. Le cinquième a 2 jours : son écart vaut
   * 3 — vers le podium — et non 1, qui aurait trahi le 4 du voisin.
   */
  it('mesure l’écart au podium, pas à la personne juste au-dessus', () => {
    const { rangs } = calculerClassement(equipe(9, 7, 5, 4, 2), MERCREDI);
    const dernier = rangs.find((rang) => rang.uid === 'u4');
    const voisin = rangs.find((rang) => rang.uid === 'u3');

    expect(dernier).toEqual({ uid: 'u4', rang: 5, ecart: 3 });
    // Et le voisin, lui non plus, ne trahit personne : 5 − 4 = 1.
    expect(voisin).toEqual({ uid: 'u3', rang: 4, ecart: 1 });
  });

  /* Le plafond déplace la dernière valeur nommée : l'écart suit, sinon il
     pointerait vers un objectif que le podium n'affiche plus. */
  it('suit la dernière valeur réellement nommée quand le plafond coupe', () => {
    const { podium, rangs } = calculerClassement(equipe(9, 7, 4, 4, 4, 4, 4, 1), MERCREDI);

    expect(podium.lignes.map((ligne) => ligne.serie)).toEqual([9, 7]);
    // Les 4 sont comptés mais pas nommés : leur écart vise le 7, pas le 4.
    expect(rangs.find((rang) => rang.uid === 'u2')?.ecart).toBe(3);
  });

  /*
   * **Zéro n'a pas de rang.** Annoncer « vous êtes dixième » à quelqu'un qui
   * n'a pas commencé, c'est le classement complet vu de l'autre bout.
   */
  it('n’attribue aucun rang à une série éteinte', () => {
    const { rangs } = calculerClassement(
      [qui('a', 5), qui('b', 3), qui('c', 2), qui('dort', 8, '2026-08-01')],
      MERCREDI,
    );

    expect(rangs.some((rang) => rang.uid === 'dort')).toBe(false);
  });

  /* Sous le seuil, aucun rang n'est écrit : sinon « vous êtes troisième » sur
     une équipe où deux personnes ont joué dit tout. */
  it('n’écrit aucun rang tant que le podium n’existe pas', () => {
    expect(calculerClassement(equipe(9, 4), MERCREDI).rangs).toEqual([]);
  });
});

describe('ce que le calcul ne lit pas', () => {
  /*
   * **Aucun taux de maîtrise ne sort de `users/{uid}`.** Le type d'entrée est
   * la garantie : le calcul ne reçoit que l'identité publiable et l'assiduité.
   * Le jour où quelqu'un ajouterait un champ de progression ici, il faudrait
   * le faire exprès, et ce test le lui rappellera.
   */
  it('ne prend qu’identité et assiduité', () => {
    const entree: Regularite = qui('u', 4, LUNDI);

    expect(Object.keys(entree).sort()).toEqual(['avatar', 'dernierJour', 'nom', 'serie', 'uid']);
  });
});

/**
 * Sous quel nom on figure au podium.
 *
 * **Le nom choisi d'abord, le prénom du compte à défaut.** Exiger le nom de
 * séance laissait hors du podium celui qui s'entraîne tous les jours sans
 * avoir jamais rejoint une séance : il n'apparaissait nulle part, sans savoir
 * pourquoi, alors qu'il était premier.
 *
 * **Et jamais l'adresse électronique** — c'est le garde-fou qui rend ce repli
 * acceptable. `users/{uid}.nom` retombe sur l'adresse quand Google ne fournit
 * pas de nom : la publier nommerait la personne *et* son adresse, sur un écran
 * que toute l'équipe lit.
 */
describe('le nom publiable', () => {
  it('prend le nom choisi pour les séances quand il existe', () => {
    expect(nomPubliable({ nomSession: 'Jo', nom: 'Jordan Mercier' })).toBe('Jo');
  });

  it('retombe sur le prénom du compte, pas sur le nom entier', () => {
    expect(nomPubliable({ nom: 'Jordan Mercier' })).toBe('Jordan');
  });

  /* Le garde-fou : la route de session écrit `nom: jeton.name ?? adresse`. */
  it('ne publie jamais une adresse électronique', () => {
    expect(nomPubliable({ nom: 'jordan@medere.fr' })).toBe('');
  });

  it('ne publie rien quand il n’y a aucun nom', () => {
    expect(nomPubliable({})).toBe('');
    expect(nomPubliable({ nom: '   ', nomSession: '' })).toBe('');
  });

  /* Un nom de séance reste ce que son porteur a écrit, entier : il l'a choisi
     pour être lu par la salle. */
  it('ne tronque pas un nom de séance en plusieurs mots', () => {
    expect(nomPubliable({ nomSession: 'Jordan M.' })).toBe('Jordan M.');
  });
});
