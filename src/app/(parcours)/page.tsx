import { Accueil } from '@/composants/parcours/Accueil';
import { lireSession } from '@/lib/auth/session-serveur';

/** 01 · Accueil du commercial. */
export default async function PageAccueil() {
  const session = await lireSession();
  const prenom = (session?.nom || session?.email || '').split(' ')[0] ?? '';

  return <Accueil prenom={prenom} />;
}
