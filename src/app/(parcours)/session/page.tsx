import { SessionParticipant } from '@/composants/session/SessionParticipant';
import { chargerReferentiel } from '@/lib/serveur/referentiel';

/** 10a · Session collective, côté commercial. */
export default async function PageSession() {
  return <SessionParticipant referentiel={await chargerReferentiel()} />;
}
