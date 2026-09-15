import { Accueil } from '@/composants/parcours/Accueil';
import { lireSession } from '@/lib/auth/session-serveur';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/** 01 · Accueil du commercial. */
export default async function PageAccueil() {
  // La session est mémoïsée pour la requête : la disposition l'a déjà
  // demandée, et les deux appels partagent le même aller-retour.
  const session = await lireSession();
  if (!session) return null;

  const referentiel = await chargerReferentielSiConnecte();
  if (!referentiel) return null;

  const prenom = (session.nom || session.email).split(' ')[0] ?? '';

  return <Accueil prenom={prenom} referentiel={referentiel} />;
}
