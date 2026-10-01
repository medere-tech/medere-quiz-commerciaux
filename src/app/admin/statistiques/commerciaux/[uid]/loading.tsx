import { Squelettes } from '@/composants/ds/etats';

/**
 * Frontière de chargement du suivi d'un commercial.
 *
 * La page lit tout sur le serveur — les comptes, les états de l'équipe, le
 * référentiel. Sans cette frontière, le clic sur un nom des statistiques
 * resterait figé le temps de cet aller-retour (CLAUDE.md, « Navigation »).
 */
export default function ChargementSuiviCommercial() {
  return (
    <div className="page-admin">
      <Squelettes lignes={6} />
    </div>
  );
}
