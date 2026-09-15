import { Squelettes } from '@/composants/ds/etats';

/**
 * Frontière de chargement de l'écran d'animation.
 *
 * Comme les trois autres sections, elle rend la route préchargeable : sans
 * elle, ouvrir la séance depuis le back-office resterait figé le temps d'un
 * aller-retour serveur. Voir `(parcours)/loading.tsx`.
 */
export default function ChargementAnimation() {
  return (
    <div style={{ padding: 'clamp(20px, 3.2vw, 36px)' }}>
      <Squelettes lignes={3} />
    </div>
  );
}
