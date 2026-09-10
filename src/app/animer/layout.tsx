import type { ReactNode } from 'react';

import { ConnexionAdmin, GardeNavigateur } from '@/composants/admin/acces';
import { lireSession } from '@/lib/auth/session-serveur';

/**
 * L'écran d'animation, hors de la coquille du back-office.
 *
 * **Il est projeté sur un mur.** Une barre latérale de navigation y prendrait
 * 232 pixels pour afficher des liens que personne ne cliquera pendant la
 * séance. D'où cette route à part, qui ne porte que la garde d'accès.
 *
 * Le contrôle est le même que celui du back-office : le custom claim porté par
 * le cookie de session, vérifié côté serveur. Une redirection côté client n'est
 * pas une protection.
 */
export const dynamic = 'force-dynamic';

export default async function DispositionAnimation({ children }: { children: ReactNode }) {
  const session = await lireSession();

  if (!session) return <ConnexionAdmin motif="anonyme" />;
  if (!session.admin) return <ConnexionAdmin motif="sans-droits" />;

  return <GardeNavigateur>{children}</GardeNavigateur>;
}
