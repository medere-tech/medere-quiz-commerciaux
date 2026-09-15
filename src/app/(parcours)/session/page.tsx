import { SessionParticipant } from '@/composants/session/SessionParticipant';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/** 10a · Session collective, côté commercial. */
export default async function PageSession() {
  const referentiel = await chargerReferentielSiConnecte();
  // Personne n'est connecté : la disposition rend l'écran de connexion, et
  // ce que cette page renvoie est écarté. On ne charge donc rien.
  if (!referentiel) return null;

  return <SessionParticipant referentiel={referentiel} />;
}
