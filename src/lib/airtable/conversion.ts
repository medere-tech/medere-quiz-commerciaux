import {
  CHAMPS,
  PLAFONDS,
  STATUT_ACTIF,
  STATUTS_CONNUS,
  type EnregistrementAirtable,
  type Formation,
} from '@/lib/airtable/contrat';

/**
 * Conversion et validation des enregistrements Airtable.
 *
 * **Pourquoi cette validation existe alors que les règles Firestore font déjà
 * le même travail.** La synchronisation écrit avec le SDK Admin, qui n'est pas
 * soumis aux règles de sécurité. Sans ce doublon, la validation des règles ne
 * couvrirait que la retouche manuelle en console — le cas qui n'arrive jamais.
 *
 * Une formation qui viole le modèle est rejetée et signalée, jamais écrite en
 * silence, et jamais au prix des autres : un enregistrement invalide n'empêche
 * pas les suivants d'être synchronisés.
 *
 * Fonctions pures : aucun appel réseau, aucune écriture. Testables sans
 * émulateur ni jeton.
 */

export type Rejet = {
  airtableId: string;
  nom: string;
  raisons: string[];
};

export type ResultatConversion = {
  formations: Formation[];
  rejets: Rejet[];
  /** Statuts rencontrés qui ne figurent pas au contrat. */
  statutsInconnus: string[];
  /**
   * Identifiants des formations dont la case « Statut » est vide. Elles sont
   * inactives, comme tout ce qui n'est pas explicitement « Active » — raison
   * de plus pour que l'oubli se voie : une case laissée vide dans Airtable
   * retire la formation du catalogue. Du diagnostic, pas de l'affichage.
   *
   * Compteur distinct des statuts inconnus : l'un signale un oubli de saisie,
   * l'autre une valeur qu'on ne sait pas lire.
   */
  statutsAbsents: string[];
};

/**
 * Une adresse Webflow saisie sans protocole n'est pas un lien : le navigateur
 * la traite comme un chemin relatif. La correction se fait ici, une fois, sur
 * ce qu'on stocke — plutôt que dans chaque écran qui affiche un lien, où l'un
 * d'eux finira par l'oublier. Airtable n'est pas modifié.
 */
export function normaliserUrl(valeur: string): string {
  const nettoyee = valeur.trim();
  if (nettoyee.length === 0) return '';
  // Un protocole explicite, quel qu'il soit, est laissé tel quel.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(nettoyee)) return nettoyee;
  return `https://${nettoyee}`;
}

function chaine(valeur: unknown): string | null {
  if (valeur === undefined || valeur === null) return '';
  if (typeof valeur !== 'string') return null;
  return valeur.trim();
}

function listeDeChaines(valeur: unknown): string[] | null {
  if (valeur === undefined || valeur === null) return [];
  if (!Array.isArray(valeur)) return null;
  if (!valeur.every((element) => typeof element === 'string')) return null;

  const nettoyees = valeur.map((element) => element.trim()).filter((element) => element.length > 0);
  // Les règles refusent les doublons ; une sélection multiple ne devrait pas
  // en produire, mais rien ne coûte de s'en assurer avant d'écrire.
  return [...new Set(nettoyees)];
}

function cumul(liste: string[]): number {
  return liste.join(',').length;
}

/**
 * Convertit un enregistrement. Renvoie la formation, ou la liste des raisons
 * qui la rendent inexploitable.
 */
function convertir(
  enregistrement: EnregistrementAirtable,
  syncLe: Date,
): { formation: Formation; statutSource: string } | { raisons: string[]; nom: string } {
  const raisons: string[] = [];
  const champs = enregistrement.fields;

  const airtableId = enregistrement.id?.trim() ?? '';
  const numeroActionDpc = chaine(champs[CHAMPS.numeroActionDpc]);
  const nom = chaine(champs[CHAMPS.nom]);
  const format = chaine(champs[CHAMPS.format]);
  const modalite = chaine(champs[CHAMPS.modalite]);
  const dureeTotale = chaine(champs[CHAMPS.dureeTotale]);
  // Le plafond porte sur l'adresse telle qu'elle sera stockée, protocole
  // ajouté compris : c'est cette valeur que les règles vérifieront.
  const urlBrute = chaine(champs[CHAMPS.urlWebflow]);
  const urlWebflow = urlBrute === null ? null : normaliserUrl(urlBrute);
  const statutSource = chaine(champs[CHAMPS.statutSource]) ?? '';
  const cibles = listeDeChaines(champs[CHAMPS.cibles]);
  const blocsCertification = listeDeChaines(champs[CHAMPS.blocsCertification]);

  // Identité : sans ces trois-là, l'enregistrement n'est pas exploitable.
  if (airtableId.length === 0) raisons.push("l'identifiant d'enregistrement est absent");
  if (airtableId.length > PLAFONDS.airtableId) {
    raisons.push(`l'identifiant dépasse ${PLAFONDS.airtableId} caractères`);
  }

  if (numeroActionDpc === null) raisons.push("le numéro d'action DPC n'est pas un texte");
  else if (numeroActionDpc.length === 0) raisons.push("le numéro d'action DPC est vide");
  else if (numeroActionDpc.length > PLAFONDS.numeroActionDpc) {
    raisons.push(`le numéro d'action DPC dépasse ${PLAFONDS.numeroActionDpc} caractères`);
  }

  if (nom === null) raisons.push("le nom de la formation n'est pas un texte");
  else if (nom.length === 0) raisons.push('le nom de la formation est vide');
  else if (nom.length > PLAFONDS.nom) {
    raisons.push(`le nom de la formation dépasse ${PLAFONDS.nom} caractères`);
  }

  // Descriptif : Airtable peut le laisser vide, jamais dépasser.
  const facultatifs = [
    ['le format', format, PLAFONDS.format],
    ['la modalité pédagogique', modalite, PLAFONDS.modalite],
    ['la durée totale', dureeTotale, PLAFONDS.dureeTotale],
    ["l'URL Webflow", urlWebflow, PLAFONDS.urlWebflow],
  ] as const;

  for (const [libelle, valeur, plafond] of facultatifs) {
    if (valeur === null) raisons.push(`${libelle} n'est pas un texte`);
    else if (valeur.length > plafond) raisons.push(`${libelle} dépasse ${plafond} caractères`);
  }

  if (cibles === null) raisons.push('le public concerné n’est pas une liste de textes');
  else if (cumul(cibles) > PLAFONDS.ciblesCumul) {
    raisons.push(`le public concerné dépasse ${PLAFONDS.ciblesCumul} caractères cumulés`);
  }

  if (blocsCertification === null) {
    raisons.push('le bloc ou axe de certification n’est pas une liste de textes');
  } else if (cumul(blocsCertification) > PLAFONDS.blocsCertificationCumul) {
    raisons.push(
      `le bloc ou axe de certification dépasse ` +
        `${PLAFONDS.blocsCertificationCumul} caractères cumulés`,
    );
  }

  if (raisons.length > 0) {
    return { raisons, nom: typeof nom === 'string' ? nom : '' };
  }

  return {
    statutSource,
    formation: {
      airtableId,
      numeroActionDpc: numeroActionDpc as string,
      nom: nom as string,
      cibles: cibles as string[],
      format: format as string,
      modalite: modalite as string,
      blocsCertification: blocsCertification as string[],
      dureeTotale: dureeTotale as string,
      urlWebflow: urlWebflow as string,
      // Liste blanche : seul « Active » met la formation au catalogue.
      actif: statutSource.toLowerCase() === STATUT_ACTIF,
      syncLe,
    },
  };
}

/**
 * Une réponse Airtable sans aucune formation exploitable, alors que la base
 * en contient, désactiverait tout le catalogue d'un coup. Aucune suppression
 * n'aurait lieu, mais plus rien ne serait proposé aux commerciaux — le
 * résultat visible est le même. Table filtrée, vue modifiée, incident côté
 * Airtable : dans tous ces cas, ne rien faire et le dire vaut mieux.
 *
 * Prédicat isolé pour être éprouvé sans réseau ni base.
 */
export function desactiveraitToutLeCatalogue(
  formationsRecues: number,
  formationsEnregistrees: number,
): boolean {
  return formationsRecues === 0 && formationsEnregistrees > 0;
}

export function convertirEnregistrements(
  enregistrements: readonly EnregistrementAirtable[],
  syncLe: Date,
): ResultatConversion {
  const formations: Formation[] = [];
  const rejets: Rejet[] = [];
  const statutsInconnus = new Set<string>();
  const statutsAbsents: string[] = [];
  const identifiantsVus = new Set<string>();

  for (const enregistrement of enregistrements) {
    const resultat = convertir(enregistrement, syncLe);

    if ('raisons' in resultat) {
      rejets.push({
        airtableId: enregistrement.id ?? '(sans identifiant)',
        nom: resultat.nom,
        raisons: resultat.raisons,
      });
      continue;
    }

    // Airtable ne renvoie pas deux fois le même enregistrement, sauf accident
    // de pagination. Le second écraserait le premier : on le signale.
    if (identifiantsVus.has(resultat.formation.airtableId)) {
      rejets.push({
        airtableId: resultat.formation.airtableId,
        nom: resultat.formation.nom,
        raisons: ['enregistrement renvoyé deux fois par Airtable'],
      });
      continue;
    }
    identifiantsVus.add(resultat.formation.airtableId);

    const statut = resultat.statutSource.toLowerCase();
    if (statut.length === 0) {
      statutsAbsents.push(resultat.formation.airtableId);
    } else if (!STATUTS_CONNUS.includes(statut)) {
      statutsInconnus.add(resultat.statutSource);
    }

    formations.push(resultat.formation);
  }

  return {
    formations,
    rejets,
    statutsInconnus: [...statutsInconnus],
    statutsAbsents,
  };
}
