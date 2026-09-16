import { ComposerSeance } from '@/composants/session/ComposerSeance';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/** Composition et lancement des séances collectives. */
export default async function PageComposerSeance() {
  const referentiel = await chargerReferentielSiConnecte();
  // Personne n'est connecté : la disposition rend l'écran de connexion, et
  // ce que cette page renvoie est écarté. On ne charge donc rien.
  if (!referentiel) return null;

  return <ComposerSeance referentiel={referentiel} />;
}
