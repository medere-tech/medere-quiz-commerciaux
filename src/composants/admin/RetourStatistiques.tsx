import Link from 'next/link';
import type { Route } from 'next';

import { Icone } from '@/composants/ds/Icone';

/**
 * Le retour vers les statistiques, en tête des écrans qu'on ouvre depuis
 * elles : le suivi d'un commercial et le détail d'une question.
 *
 * Dessiné par la maquette du suivi (`screens-person.jsx`, `BackLink`) : un
 * chevron retourné et le nom de l'écran, sans « Retour » devant — le chevron
 * le dit déjà. Un vrai lien, pour que la destination se précharge.
 */
export function RetourStatistiques() {
  return (
    <Link href={'/admin/statistiques' as Route} className="retour-statistiques">
      <Icone nom="chevronRight" taille={16} style={{ transform: 'rotate(180deg)' }} />
      Statistiques
    </Link>
  );
}
