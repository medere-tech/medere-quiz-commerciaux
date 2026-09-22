import { ComposerSeance } from '@/composants/session/ComposerSeance';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/**
 * Page 7 · Composer une séance.
 *
 * Deux entrées possibles, toutes deux par la barre d'adresse :
 * `?reprendre={id}` rouvre une séance préparée, `?ratees=a,b,c` part des
 * questions qui ont trébuché lors d'une séance passée.
 */
export default async function PageComposerSeance({
  searchParams,
}: {
  searchParams: Promise<{ reprendre?: string; ratees?: string }>;
}) {
  const referentiel = await chargerReferentielSiConnecte();
  if (!referentiel) return null;

  const parametres = await searchParams;
  const ratees = parametres.ratees?.split(',').filter((valeur) => valeur !== '');

  return (
    <ComposerSeance
      referentiel={referentiel}
      reprise={parametres.reprendre}
      ratees={ratees}
    />
  );
}
