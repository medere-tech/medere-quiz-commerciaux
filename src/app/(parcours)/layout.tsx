import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { Connexion } from '@/composants/parcours/Connexion';
import { Coquille, type Entree } from '@/composants/ds/Coquille';
import { GardeNavigateur } from '@/composants/admin/acces';
import { lireSession } from '@/lib/auth/session-serveur';

/**
 * Espace du commercial : accueil et questions à revoir.
 *
 * La série vit hors de cette coquille, sur sa propre route : pendant dix
 * questions, la navigation latérale n'a rien à faire à l'écran. C'est le mode
 * focus décrit par les maquettes.
 *
 * **Les entrées non livrées restent visibles et inertes.** « Séries » et
 * « Catalogue » attendent des écrans non tranchés au tri des maquettes,
 * « Session du jeudi » attend le lot 7. Les masquer ferait changer la
 * navigation de forme à chaque livraison ; les afficher inertes dit ce qui
 * viendra.
 */
export const dynamic = 'force-dynamic';

const NAVIGATION_COMMERCIAL: Entree[] = [
  { libelle: 'Accueil', icone: 'home', chemin: '/', route: '/' },
  { libelle: 'Séries', icone: 'layers', chemin: '/series' },
  { libelle: 'À revoir', icone: 'refresh', chemin: '/a-revoir', route: '/a-revoir' },
  { libelle: 'Catalogue', icone: 'book', chemin: '/catalogue' },
  { libelle: 'Session du jeudi', icone: 'users', chemin: '/session' },
];

export default async function DispositionParcours({ children }: { children: ReactNode }) {
  const session = await lireSession();

  if (!session) return <Connexion motif="anonyme" />;

  const temoins = await cookies();
  const choisi = temoins.get('medere-barre')?.value;
  const barreReduite = choisi === 'reduite' || choisi === 'etendue' ? choisi : 'auto';

  return (
    <Coquille
      nom={session.nom || session.email}
      role="Commercial"
      entrees={NAVIGATION_COMMERCIAL}
      barreReduite={barreReduite}
    >
      <GardeNavigateur>{children}</GardeNavigateur>
    </Coquille>
  );
}
