import { ComposerSeance } from '@/composants/session/ComposerSeance';
import { chargerReferentiel } from '@/lib/serveur/referentiel';

/** Composition et lancement des séances collectives. */
export default async function PageComposerSeance() {
  return <ComposerSeance referentiel={await chargerReferentiel()} />;
}
