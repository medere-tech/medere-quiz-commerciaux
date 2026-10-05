/**
 * Un document Firestore vers le modèle des formations.
 *
 * **Ni client ni serveur.** Ce module ne porte pas de directive `'use client'`
 * et n'importe aucun SDK : le dépôt navigateur et la lecture serveur du
 * référentiel s'en servent tous les deux. Deux convertisseurs pour une même
 * collection finiraient par diverger.
 */

export type Formation = {
  id: string;
  nom: string;
  numeroActionDpc: string;
  cibles: string[];
  format: string;
  modalite: string;
  dureeTotale: string;
  urlWebflow: string;
  blocsCertification: string[];
  /** L'identifiant de son sujet, ou `null` : la page d'un sujet en dépend. */
  sujetId: string | null;
  actif: boolean;
};

export function enFormation(identifiant: string, donnees: Record<string, unknown>): Formation {
  return {
    id: identifiant,
    nom: typeof donnees.nom === 'string' ? donnees.nom : '',
    numeroActionDpc: typeof donnees.numeroActionDpc === 'string' ? donnees.numeroActionDpc : '',
    cibles: Array.isArray(donnees.cibles) ? (donnees.cibles as string[]) : [],
    format: typeof donnees.format === 'string' ? donnees.format : '',
    modalite: typeof donnees.modalite === 'string' ? donnees.modalite : '',
    dureeTotale: typeof donnees.dureeTotale === 'string' ? donnees.dureeTotale : '',
    urlWebflow: typeof donnees.urlWebflow === 'string' ? donnees.urlWebflow : '',
    blocsCertification: Array.isArray(donnees.blocsCertification)
      ? (donnees.blocsCertification as string[])
      : [],
    sujetId: typeof donnees.sujetId === 'string' && donnees.sujetId.length > 0 ? donnees.sujetId : null,
    actif: donnees.actif === true,
  };
}
