import type { ReactNode } from 'react';

import { Connexion } from '@/composants/parcours/Connexion';
import { GardeNavigateur } from '@/composants/admin/acces';
import { lireSession } from '@/lib/auth/session-serveur';

/**
 * La série est en mode focus : pas de navigation latérale, rien qui distraie
 * pendant les dix questions. Seule la barre du haut permet d'en sortir.
 */
export const dynamic = 'force-dynamic';

export default async function DispositionSerie({ children }: { children: ReactNode }) {
  const session = await lireSession();
  if (!session) return <Connexion motif="anonyme" />;

  return <GardeNavigateur>{children}</GardeNavigateur>;
}
