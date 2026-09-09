import { Squelettes } from '@/composants/ds/etats';

/**
 * Frontière de chargement de la série.
 *
 * Elle rend la route préchargeable — voir `(parcours)/loading.tsx` pour le
 * pourquoi. Quatre lignes, comme le repli de `Suspense` dans la page : lancer
 * une série depuis l'accueil ne doit pas faire changer la page de forme deux
 * fois.
 */
export default function ChargementSerie() {
  return (
    <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
      <Squelettes lignes={4} />
    </div>
  );
}
