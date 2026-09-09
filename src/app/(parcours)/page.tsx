import { Accueil } from '@/composants/parcours/Accueil';
import { lireSession } from '@/lib/auth/session-serveur';
import { chargerReferentiel } from '@/lib/serveur/referentiel';

/** 01 · Accueil du commercial. */
export default async function PageAccueil() {
  // La session est déjà mémoïsée pour la requête : la disposition l'a lue.
  const [session, referentiel] = await Promise.all([lireSession(), chargerReferentiel()]);
  const prenom = (session?.nom || session?.email || '').split(' ')[0] ?? '';

  return <Accueil prenom={prenom} referentiel={referentiel} />;
}
