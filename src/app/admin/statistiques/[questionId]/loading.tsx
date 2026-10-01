import { Squelettes } from '@/composants/ds/etats';

/**
 * Frontière de chargement de l'écran d'une question.
 *
 * La page lit tout sur le serveur — les comptes, leurs états, l'agrégat de la
 * question. Sans cette frontière, le clic sur une ligne des statistiques
 * resterait figé le temps de cet aller-retour (CLAUDE.md, « Navigation »).
 */
export default function ChargementResultatsQuestion() {
  return (
    <div className="page-admin">
      <Squelettes lignes={6} />
    </div>
  );
}
