import type { Formation } from '@/lib/formations/lecture';
import { identiteVisuelle } from '@/lib/formations/identite';
import type { QuestionListee } from '@/lib/questions/lecture';
import { maitrise, type Maitrise } from '@/lib/serie/maitrise';
import type { EtatQuestion } from '@/lib/serie/tirage';

/**
 * Ce qu'une page de sujet calcule, sans rien lire.
 *
 * **Un module pur.** La page est rendue au serveur, la série filtre au
 * navigateur : les deux s'appuient sur les mêmes fonctions, pour qu'un sujet
 * ne compte pas d'autres questions dans la série que sur sa page.
 *
 * Les faits qui ont fixé ces choix sont dans `docs/airtable-formations.md`,
 * « Ce que le relevé impose à la page par sujet » : une fiche s'identifie par
 * son titre, trois axes varient, et deux fiches d'un même sujet peuvent ne se
 * distinguer que par leur numéro d'action DPC.
 */

/** Le format tel que la base le porte, avec son libellé et son icône. */
export type FormatFiche = {
  libelle: string;
  icone: 'users' | 'monitor' | 'play' | 'layers' | 'book';
  rang: number;
};

/*
 * Les trois formats de la maquette, plus « Hybride », qu'elle ne dessine pas.
 * **Le format affiché est celui de la base, jamais celui du titre** : quatre
 * fiches « Hybride » portent « (E-learning) » dans leur nom, et c'est la base
 * qui fait foi.
 *
 * L'icône d'« Hybride » n'est pas dans la maquette : `layers`, deux plans
 * superposés, est prise dans le jeu existant plutôt qu'inventée.
 */
const FORMATS: Record<string, FormatFiche> = {
  présentiel: { libelle: 'Présentiel', icone: 'users', rang: 0 },
  'classe virtuelle': { libelle: 'Classe virtuelle', icone: 'monitor', rang: 1 },
  'e-learning': { libelle: 'E-learning', icone: 'play', rang: 2 },
  hybride: { libelle: 'Hybride', icone: 'layers', rang: 3 },
};

export function formatDeFiche(fiche: Pick<Formation, 'format'>): FormatFiche {
  const connu = FORMATS[fiche.format.trim().toLowerCase()];
  if (connu) return connu;
  return fiche.format.trim().length > 0
    ? { libelle: fiche.format.trim(), icone: 'book', rang: 4 }
    : { libelle: 'Format non précisé', icone: 'book', rang: 5 };
}

/**
 * La durée telle qu'on la lit : « 8 h ». Airtable la donne en heures, en
 * nombre nu, et l'unité est une décision d'affichage (README, section 6) —
 * l'écran Formations l'affiche déjà ainsi. Une durée déjà rédigée reste
 * telle quelle.
 */
export function dureeLisible(duree: string): string {
  const nette = duree.trim();
  return /^\d+([.,]\d+)?$/.test(nette) ? `${nette} h` : nette;
}

/** Par ordre d'identifiant : déterministe, sans dépendre de l'ordre de lecture. */
function parIdentifiant(a: Formation, b: Formation): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Les fiches à montrer : celles du catalogue, rangées par format comme la
 * maquette — présentiel, classe virtuelle, e-learning —, puis par titre.
 *
 * Une fiche inactive n'est pas proposée aux commerciaux : elle ne se vend
 * plus. Ses questions comptent toujours dans la maîtrise, comme sur l'accueil.
 */
export function fichesAffichees(fiches: readonly Formation[]): Formation[] {
  return fiches
    .filter((fiche) => fiche.actif)
    .sort(
      (a, b) =>
        formatDeFiche(a).rang - formatDeFiche(b).rang ||
        a.nom.localeCompare(b.nom, 'fr') ||
        parIdentifiant(a, b),
    );
}

/** L'union des publics, sans doublon, dans l'ordre des fiches par identifiant. */
export function publicsDuSujet(fiches: readonly Formation[]): string[] {
  const vus = new Set<string>();
  for (const fiche of [...fiches].sort(parIdentifiant)) {
    for (const cible of fiche.cibles) vus.add(cible);
  }
  return [...vus];
}

/**
 * La forme et la teinte du sujet : celles de sa première fiche par ordre
 * d'identifiant. Un choix arbitraire, mais déterministe — la même page porte
 * toujours la même forme.
 */
export function identiteDuSujet(
  fiches: readonly [Formation, ...Formation[]],
): { fichier: string; couleur: string } {
  const [premiere] = [...fiches].sort(parIdentifiant) as [Formation, ...Formation[]];
  return identiteVisuelle(premiere);
}

function clefDesAxes(fiche: Formation): string {
  return [
    formatDeFiche(fiche).libelle,
    fiche.modalite.trim(),
    [...fiche.cibles].sort().join('|'),
  ].join('§');
}

/**
 * Les fiches qu'un autre de ses voisins égale sur le format, la modalité et
 * le public. Le titre ne suffit pas toujours à les séparer — deux paires du
 * catalogue portent le même —, et le numéro d'action DPC est alors le seul
 * discriminant : on ne le montre que là, pour ne pas charger les autres.
 */
export function fichesIndiscernables(fiches: readonly Formation[]): Set<string> {
  const parClef = new Map<string, string[]>();
  for (const fiche of fiches) {
    const clef = clefDesAxes(fiche);
    parClef.set(clef, [...(parClef.get(clef) ?? []), fiche.id]);
  }
  return new Set([...parClef.values()].filter((ids) => ids.length > 1).flat());
}

/** Les questions servies qui portent sur au moins une fiche du sujet. */
export function questionsDuSujet<Q extends Pick<QuestionListee, 'id' | 'formationIds'>>(
  questions: readonly Q[],
  ficheIds: ReadonlySet<string>,
): Q[] {
  return questions.filter((question) => question.formationIds.some((id) => ficheIds.has(id)));
}

export type MaitriseSujet = Maitrise & {
  /** Questions vues au moins une fois. */
  vues: number;
  /** Dernière tentative ratée : la même définition que « À revoir ». */
  aRevoir: number;
};

/**
 * La maîtrise d'un sujet : celle de l'ensemble, sans doublon, des questions
 * rattachées à ses fiches. Une question rattachée à deux fiches du même sujet
 * ne compte qu'une fois.
 */
export function maitriseDuSujet(
  questions: readonly Pick<QuestionListee, 'id' | 'formationIds'>[],
  etats: readonly EtatQuestion[],
  ficheIds: ReadonlySet<string>,
): MaitriseSujet {
  const parQuestion = new Map(etats.map((etat) => [etat.id, etat]));
  const concernes = questionsDuSujet(questions, ficheIds)
    .map((question) => parQuestion.get(question.id))
    .filter((etat): etat is EtatQuestion => etat !== undefined);

  return {
    ...maitrise(concernes),
    vues: concernes.filter((etat) => etat.dejaVue).length,
    aRevoir: concernes.filter((etat) => etat.derniereRatee).length,
  };
}
