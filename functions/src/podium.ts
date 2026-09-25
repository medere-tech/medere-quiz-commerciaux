/**
 * Le podium de régularité — trois premiers nommés, et rien d'autre.
 *
 * **L'écart assumé de l'écran 04b.** La maquette dessine un classement complet
 * de l'équipe sur le taux de maîtrise. Ce n'est pas ce qu'on construit, pour
 * deux raisons décidées avec Déthié :
 *
 * 1. **La régularité, pas la maîtrise.** C'est ce que l'outil cherche à
 *    encourager, et être peu régulier ne dit pas qu'on est mauvais. Le taux de
 *    maîtrise ne sort jamais de `users/{uid}`.
 * 2. **Le podium, pas le classement.** Sur une équipe de dix, un classement
 *    complet expose publiquement ceux qui rament — et ce sont eux qui ont le
 *    plus besoin de l'outil.
 *
 * **Deux documents, deux portées, et c'est ce qui tient la confidentialité.**
 * Le podium est lisible par le domaine et ne contient que les nommés ; le rang
 * de chacun vit dans un document que lui seul lit. Aucune distribution, même
 * anonyme : sur dix personnes, un zéro dans une liste se devine.
 *
 * **Rien de ce fichier ne lit autre chose que `assiduite`.**
 */

/** Ce que le calcul prend d'un commercial. Rien d'autre n'est lu. */
export type Regularite = {
  uid: string;
  nom: string;
  avatar: string;
  /** La série telle qu'elle est stockée, avant péremption. */
  serie: number;
  /** Dernier jour actif, en `AAAA-MM-JJ`. Vide si jamais joué. */
  dernierJour: string;
};

/** Une ligne du podium, telle qu'elle est publiée. */
export type LignePodium = {
  uid: string;
  nom: string;
  avatar: string;
  rang: number;
  /** La série au moment du calcul. Le client la recalcule à la lecture. */
  serie: number;
  dernierJour: string;
};

export type Podium = {
  lignes: LignePodium[];
  /**
   * Ceux qui tiennent le dernier rang nommé mais qu'on ne nomme pas, faute de
   * place. Zéro dans le cas courant.
   */
  autresAuDernierRang: number;
};

/** Le rang de quelqu'un, écrit dans un document que lui seul lit. */
export type RangPersonnel = {
  uid: string;
  rang: number;
  /**
   * Jours à gagner pour **entrer au podium**. `null` pour qui y est déjà.
   *
   * **Mesuré contre la dernière valeur nommée, et surtout pas contre celle du
   * voisin immédiat.** L'écart au voisin, combiné à sa propre série, donnerait
   * la série de quelqu'un qu'on ne nomme pas — et sur une équipe de dix, cela
   * se recoupe vite. La dernière valeur du podium, elle, est déjà affichée :
   * l'écart n'est plus qu'une soustraction entre deux nombres publics, et
   * n'apprend rien que l'écran ne dise déjà.
   */
  ecart: number | null;
};

/**
 * Au-delà, la liste devient le classement complet qu'on refuse. Le groupe du
 * dernier rang nommé est alors compté sans être nommé.
 */
export const PLAFOND_NOMMES = 6;

/**
 * **En dessous, pas de podium du tout.**
 *
 * Lundi matin, deux personnes ont joué et huit non. Un podium qui nomme les
 * deux dit implicitement que les huit autres sont à zéro : sur une équipe de
 * dix, c'est le classement complet par soustraction. Il faut trois séries
 * vivantes pour que le podium dise quelque chose sans en dire trop.
 */
export const SERIES_MINIMUM = 3;

/**
 * Le nom sous lequel quelqu'un peut figurer au podium.
 *
 * **Le nom choisi d'abord, le prénom du compte à défaut.** Exiger
 * `nomSession` — le nom qu'on se donne en séance — laissait hors du podium
 * celui qui s'entraîne tous les jours depuis trois semaines sans avoir jamais
 * rejoint une séance : il n'apparaissait nulle part, sans savoir pourquoi,
 * alors qu'il était premier. Le prénom du compte professionnel est le même
 * repli que celui de l'écran d'accès à une séance, qui préremplit déjà avec.
 *
 * **Mais jamais l'adresse électronique.** `users/{uid}.nom` retombe sur
 * l'adresse quand Google ne fournit pas de nom — voir la route de session.
 * La publier nommerait la personne *et* son adresse, sur un écran que toute
 * l'équipe lit. Sans nom utilisable, pas de ligne : le rang reste su de son
 * seul porteur.
 *
 * **Le prénom seul**, comme partout ailleurs : un nom légal complet n'a rien à
 * faire sur un tableau d'encouragement.
 */
export function nomPubliable(donnees: Record<string, unknown>): string {
  const choisi = typeof donnees.nomSession === 'string' ? donnees.nomSession.trim() : '';
  if (choisi !== '') return choisi;

  const reel = typeof donnees.nom === 'string' ? donnees.nom.trim() : '';
  if (reel === '' || reel.includes('@')) return '';
  return reel.split(' ')[0] ?? '';
}

/* ------------------------------------------------- la péremption des séries */

/** Lundi à vendredi. */
function estOuvre(clef: string): boolean {
  const jour = new Date(`${clef}T00:00:00Z`).getUTCDay();
  return jour >= 1 && jour <= 5;
}

/**
 * Aucun jour ouvré manqué entre ces deux jours.
 *
 * **Copie assumée de `src/lib/serie/assiduite.ts`.** `functions/` est un
 * paquet npm à part, sans accès à `src/` : la logique est dupliquée, et les
 * tests des deux côtés portent sur les mêmes cas pour que la copie ne dérive
 * pas en silence. Le jour où l'une change, l'autre doit changer.
 */
export function serieContinue(precedent: string, aujourdhui: string): boolean {
  if (!precedent || precedent >= aujourdhui) return false;

  const debut = Date.parse(`${precedent}T00:00:00Z`);
  const fin = Date.parse(`${aujourdhui}T00:00:00Z`);
  if (fin - debut > 14 * 86_400_000) return false;

  for (let instant = debut + 86_400_000; instant < fin; instant += 86_400_000) {
    if (estOuvre(new Date(instant).toISOString().slice(0, 10))) return false;
  }
  return true;
}

/**
 * La série telle qu'elle vaut aujourd'hui.
 *
 * **Une série se périme sans que personne n'écrive.** Qui s'arrête voit la
 * sienne tomber, mais aucun document ne change : un podium figé à l'écriture
 * annoncerait « 7 jours » pour quelqu'un qui n'a pas joué depuis trois
 * semaines. On classe donc sur la valeur du jour, pas sur la valeur stockée.
 */
export function serieDuJour(regularite: Regularite, aujourdhui: string): number {
  if (!regularite.dernierJour) return 0;
  const vivante =
    regularite.dernierJour === aujourdhui ||
    serieContinue(regularite.dernierJour, aujourdhui);
  return vivante ? regularite.serie : 0;
}

/* ----------------------------------------------------------- le classement */

/**
 * Les rangs, partagés en cas d'égalité.
 *
 * Trois personnes à quatre jours occupent toutes le rang 2, et la suivante le
 * rang 5 — la numérotation sportive. Départager sur un second critère aurait
 * demandé d'inventer une hiérarchie là où il n'y en a pas.
 */
function parRang(
  equipe: Regularite[],
  aujourdhui: string,
): { regularite: Regularite; serie: number; rang: number }[] {
  const avecSerie = equipe
    .map((regularite) => ({ regularite, serie: serieDuJour(regularite, aujourdhui) }))
    .filter((ligne) => ligne.serie > 0)
    .sort((gauche, droite) => droite.serie - gauche.serie);

  let rang = 0;
  let precedente: number | null = null;

  return avecSerie.map((ligne, position) => {
    if (ligne.serie !== precedente) {
      rang = position + 1;
      precedente = ligne.serie;
    }
    return { ...ligne, rang };
  });
}

/**
 * Le podium : les trois meilleures **valeurs**, pas les trois premières
 * personnes.
 *
 * Une série à zéro n'est jamais nommée, quel que soit son rang : un zéro est
 * une absence, pas une performance.
 */
export function calculerPodium(equipe: Regularite[], aujourdhui: string): Podium {
  const classees = parRang(equipe, aujourdhui);

  if (classees.length < SERIES_MINIMUM) return { lignes: [], autresAuDernierRang: 0 };

  const valeurs = [...new Set(classees.map((ligne) => ligne.serie))].slice(0, 3);
  const retenues = classees.filter((ligne) => valeurs.includes(ligne.serie));

  // Le plafond ne coupe pas au milieu d'un rang : on retire le dernier groupe
  // entier plutôt que d'en nommer trois sur sept au hasard.
  if (retenues.length > PLAFOND_NOMMES) {
    const dernierRang = retenues[retenues.length - 1]!.rang;
    const gardees = retenues.filter((ligne) => ligne.rang !== dernierRang);
    return {
      lignes: gardees.map(enLigne),
      autresAuDernierRang: retenues.length - gardees.length,
    };
  }

  return { lignes: retenues.map(enLigne), autresAuDernierRang: 0 };
}

function enLigne(ligne: { regularite: Regularite; serie: number; rang: number }): LignePodium {
  return {
    uid: ligne.regularite.uid,
    nom: ligne.regularite.nom,
    avatar: ligne.regularite.avatar,
    rang: ligne.rang,
    serie: ligne.serie,
    dernierJour: ligne.regularite.dernierJour,
  };
}

/**
 * Le rang de chacun, et ce qui le sépare de la valeur au-dessus.
 *
 * **Seul son propriétaire lira le sien.** C'est ce qui permet d'annoncer
 * « 5e · deux jours de plus pour entrer au podium » sans que personne
 * n'apprenne quoi que ce soit sur les autres : le rang est privé, et l'écart
 * se mesure contre une valeur déjà affichée.
 *
 * Une série à zéro n'a pas de rang. Annoncer « vous êtes dixième » à qui n'a
 * pas commencé, c'est le classement complet vu de l'autre bout.
 */
export function calculerRangs(
  equipe: Regularite[],
  aujourdhui: string,
  podium: Podium,
): RangPersonnel[] {
  const classees = parRang(equipe, aujourdhui);
  if (podium.lignes.length === 0) return [];

  const surLePodium = new Set(podium.lignes.map((ligne) => ligne.uid));
  const derniereNommee = podium.lignes[podium.lignes.length - 1]!.serie;

  return classees.map((ligne) => ({
    uid: ligne.regularite.uid,
    rang: ligne.rang,
    /* Qui est au podium n'a pas d'écart à combler : sa ligne le dit déjà,
       marquée « Vous ». Le redire serait deux fois la même information. */
    ecart: surLePodium.has(ligne.regularite.uid)
      ? null
      : Math.max(1, derniereNommee - ligne.serie),
  }));
}

/**
 * Le podium et les rangs, d'un seul calcul.
 *
 * **Les deux ne peuvent pas diverger, et c'est le point.** L'écart de chacun
 * se mesure contre la dernière valeur *nommée* : si les rangs étaient calculés
 * à part, une évolution du plafond ou du seuil ferait pointer l'écart vers une
 * valeur que le podium n'affiche plus, et l'écran annoncerait un objectif
 * invisible.
 */
export function calculerClassement(
  equipe: Regularite[],
  aujourdhui: string,
): { podium: Podium; rangs: RangPersonnel[] } {
  const podium = calculerPodium(equipe, aujourdhui);
  return { podium, rangs: calculerRangs(equipe, aujourdhui, podium) };
}
