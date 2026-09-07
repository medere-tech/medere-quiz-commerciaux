import type { ReactNode } from 'react';

import { ConnexionAdmin, GardeNavigateur } from '@/composants/admin/acces';
import { CoquilleAdmin } from '@/composants/admin/CoquilleAdmin';
import { lireSession } from '@/lib/auth/session-serveur';

/**
 * Protection du back-office, côté serveur.
 *
 * Le contrôle porte sur le custom claim porté par le cookie de session, pas
 * sur un champ Firestore ni sur une redirection côté client. Une redirection
 * n'est pas une protection : elle se contourne en coupant le JavaScript.
 */
export const dynamic = 'force-dynamic';

export default async function DispositionAdmin({ children }: { children: ReactNode }) {
  const session = await lireSession();

  if (!session) return <ConnexionAdmin motif="anonyme" />;
  if (!session.admin) return <ConnexionAdmin motif="sans-droits" />;

  return (
    <CoquilleAdmin nom={session.nom || session.email}>
      <GardeNavigateur>{children}</GardeNavigateur>
    </CoquilleAdmin>
  );
}
