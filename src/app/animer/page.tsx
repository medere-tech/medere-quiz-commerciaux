import { SessionAnimateur } from '@/composants/session/SessionAnimateur';
import { chargerReferentiel } from '@/lib/serveur/referentiel';

/** 10b · Session collective, côté animatrice. Écran projeté. */
export default async function PageAnimation() {
  return <SessionAnimateur referentiel={await chargerReferentiel()} />;
}
