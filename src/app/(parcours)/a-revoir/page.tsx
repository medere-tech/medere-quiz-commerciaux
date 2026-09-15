import { ARevoir } from '@/composants/parcours/ARevoir';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/** 05 · Questions à revoir. */
export default async function PageARevoir() {
  const referentiel = await chargerReferentielSiConnecte();
  // Personne n'est connecté : la disposition rend l'écran de connexion, et
  // ce que cette page renvoie est écarté. On ne charge donc rien.
  if (!referentiel) return null;

  return <ARevoir referentiel={referentiel} />;
}
