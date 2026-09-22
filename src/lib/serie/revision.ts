import { clefDuJour } from '@/lib/serie/assiduite';

/**
 * Ce que l'écran « À revoir » trie et date.
 *
 * Aucun accès réseau, aucun React : deux fonctions pures, pour que le tri et
 * la date se vérifient sans monter d'écran.
 */

/* ------------------------------------------------------------ « Vu mardi » */

/**
 * Depuis quand une question n'a pas été vue.
 *
 * **Le jour de la semaine ne se suffit à lui-même qu'une semaine.** La maquette
 * écrit « Vu mardi », et c'est juste tant que le mardi en question est celui
 * qui vient de passer. Au-delà, « mardi » désigne quatre mardis et n'apprend
 * plus rien — c'est exactement le défaut de la date d'explication qu'on a
 * corrigé au 13 : une date qui pourrait vouloir dire n'importe quoi vaut moins
 * que pas de date.
 *
 * Six jours en arrière, donc, et pas sept : « Vu mardi » un mardi désignerait
 * sinon aujourd'hui **et** la semaine dernière.
 *
 * Le jour se calcule à Paris, comme l'assiduité, et pour la même raison : c'est
 * le fuseau où l'on travaille.
 */
const FUSEAU = 'Europe/Paris';

/** Au-delà, on cesse de nommer le jour et on donne la date. */
const JOURS_NOMMABLES = 6;

export function vuQuand(vueLeMs: number | null, maintenant: Date = new Date()): string | null {
  if (vueLeMs === null) return null;

  const vue = new Date(vueLeMs);
  const clefVue = clefDuJour(vue);
  const clefJour = clefDuJour(maintenant);

  if (clefVue === clefJour) return 'aujourd’hui';

  const ecart = Math.round(
    (Date.parse(`${clefJour}T00:00:00Z`) - Date.parse(`${clefVue}T00:00:00Z`)) / 86_400_000,
  );

  /* Une date future n'existe pas ici — les règles refusent un horodatage à
     venir — mais une horloge de navigateur en avance en produirait une. On la
     traite comme aujourd'hui plutôt que d'écrire « vu dans deux jours ». */
  if (ecart <= 0) return 'aujourd’hui';
  if (ecart === 1) return 'hier';

  if (ecart <= JOURS_NOMMABLES) {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long' }).format(vue);
  }

  return `le ${new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    day: 'numeric',
    month: 'long',
  }).format(vue)}`;
}

/* ------------------------------------------------------------------- le tri */

export const TRIS = ['echecs', 'anciennete', 'formation'] as const;
export type Tri = (typeof TRIS)[number];

/**
 * Les trois tris, et pourquoi ces trois-là.
 *
 * **Chacun se lit sur une colonne que l'écran affiche déjà.** Un tri sur une
 * donnée invisible laisse devant une liste qui a bougé sans qu'on sache
 * pourquoi. Le compte d'échecs, la date de dernière vue et la formation sont
 * les trois choses qu'une ligne montre.
 */
export const LIBELLES_TRI: Record<Tri, string> = {
  echecs: 'Erreurs répétées',
  anciennete: 'Vues il y a longtemps',
  formation: 'Par formation',
};

export type LigneARevoir = {
  id: string;
  echecs: number;
  vueLeMs: number | null;
  formation: string;
};

/**
 * Trie une liste déjà en mémoire.
 *
 * **Rend un nouveau tableau, et ne touche pas à l'entrée.** Le tableau reçu est
 * celui qu'un `useMemo` garde d'un rendu à l'autre : le trier sur place ferait
 * dépendre le résultat de l'ordre des rendus.
 *
 * **Chaque tri se termine par le même départage**, l'identifiant : sans lui,
 * deux questions à égalité changeraient de place d'un rendu à l'autre selon
 * l'ordre d'arrivée, et la liste sauterait sous le doigt.
 */
export function trierARevoir<L extends LigneARevoir>(lignes: L[], tri: Tri): L[] {
  const copie = [...lignes];

  copie.sort((a, b) => {
    if (tri === 'echecs') {
      if (b.echecs !== a.echecs) return b.echecs - a.echecs;
    } else if (tri === 'anciennete') {
      /* Jamais vue en tête : c'est le cas le plus ancien qui soit. En pratique
         il ne se présente pas — une question à revoir a été ratée, donc vue —
         mais un état écrit avant que `majLe` existe n'en porte pas. */
      const gauche = a.vueLeMs ?? -Infinity;
      const droite = b.vueLeMs ?? -Infinity;
      if (gauche !== droite) return gauche - droite;
    } else {
      const ordre = a.formation.localeCompare(b.formation, 'fr');
      if (ordre !== 0) return ordre;
      /* À formation égale, les plus ratées d'abord : on ouvre un sujet pour
         travailler ce qui y résiste. */
      if (b.echecs !== a.echecs) return b.echecs - a.echecs;
    }

    return a.id.localeCompare(b.id);
  });

  return copie;
}

export function estTri(valeur: string): valeur is Tri {
  return (TRIS as readonly string[]).includes(valeur);
}
