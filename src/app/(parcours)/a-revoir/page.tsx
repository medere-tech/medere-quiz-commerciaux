import { ARevoir } from '@/composants/parcours/ARevoir';
import { chargerReferentiel } from '@/lib/serveur/referentiel';

/** 05 · Questions à revoir. */
export default async function PageARevoir() {
  return <ARevoir referentiel={await chargerReferentiel()} />;
}
