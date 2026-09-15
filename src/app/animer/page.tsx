import { SessionAnimateur } from '@/composants/session/SessionAnimateur';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/** 10b · Session collective, côté animatrice. Écran projeté. */
export default async function PageAnimation() {
  const referentiel = await chargerReferentielSiConnecte();
  // Personne n'est connecté : la disposition rend l'écran de connexion, et
  // ce que cette page renvoie est écarté. On ne charge donc rien.
  if (!referentiel) return null;

  return <SessionAnimateur referentiel={referentiel} />;
}
