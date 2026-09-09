import { Squelettes } from '@/composants/ds/etats';

/**
 * Frontière de chargement du back-office.
 *
 * Elle rend les routes d'administration préchargeables — voir
 * `(parcours)/loading.tsx` pour le pourquoi. Six lignes : c'est le nombre que
 * la banque, les formations et les statistiques affichent déjà pendant leur
 * propre chargement.
 */
export default function ChargementAdmin() {
  return (
    <div className="page-admin">
      <Squelettes lignes={6} />
    </div>
  );
}
