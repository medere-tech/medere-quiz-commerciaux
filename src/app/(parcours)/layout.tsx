import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { Connexion } from '@/composants/parcours/Connexion';
import { Coquille, type Bascule, type Entree } from '@/composants/ds/Coquille';
import { GardeNavigateur } from '@/composants/admin/acces';
import { lireSession } from '@/lib/auth/session-serveur';

/**
 * Espace du commercial : accueil et questions à revoir.
 *
 * La série vit hors de cette coquille, sur sa propre route : pendant dix
 * questions, la navigation latérale n'a rien à faire à l'écran. C'est le mode
 * focus décrit par les maquettes.
 *
 * **Plus aucune entrée inerte.** « Session du jeudi » s'est activée au lot 7 ;
 * la navigation ne mène plus qu'à des écrans qui existent.
 *
 * Deux entrées y figuraient et ont été retirées. « Catalogue » ne correspondait
 * à aucune maquette — elle avait été inventée. « Séries » renvoie à l'écran
 * 01b, en attente d'un arbitrage produit qui n'est pas pris : la sélection
 * manuelle permet d'éviter les formations mal maîtrisées, ce que le tirage
 * pondéré cherche justement à empêcher. Une entrée morte dans une navigation
 * est un défaut : soit elle mène quelque part, soit elle n'existe pas. Voir
 * `docs/design-imports.md`, écran 01b.
 */
export const dynamic = 'force-dynamic';

/**
 * Le retour vers le back-office, réservé à l'équipe pédagogique.
 *
 * Il vise `/admin/questions` et non `/admin`, qui n'est qu'une redirection :
 * une route préchargée doit être celle qui rend, pas celle qui renvoie.
 */
const VERS_LE_BACK_OFFICE: Bascule = {
  route: '/admin/questions',
  libelle: 'Revenir au back-office',
  icone: 'pencil',
};

const NAVIGATION_COMMERCIAL: Entree[] = [
  { libelle: 'Accueil', icone: 'home', chemin: '/', route: '/' },
  { libelle: 'À revoir', icone: 'refresh', chemin: '/a-revoir', route: '/a-revoir' },
  { libelle: 'Session du jeudi', icone: 'users', chemin: '/session', route: '/session' },
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
      // Noémie parcourt les mêmes écrans que les commerciaux, mais elle n'en
      // est pas une : la pastille dit qui l'on est, pas où l'on se trouve.
      role={session.admin ? 'Responsable pédagogique' : 'Commercial'}
      contexte="Entraînement"
      entrees={NAVIGATION_COMMERCIAL}
      bascule={session.admin ? VERS_LE_BACK_OFFICE : undefined}
      barreReduite={barreReduite}
    >
      <GardeNavigateur>{children}</GardeNavigateur>
    </Coquille>
  );
}
