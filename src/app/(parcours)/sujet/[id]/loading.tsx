import { Squelettes } from '@/composants/ds/etats';

/**
 * Frontière de chargement de la page d'un sujet.
 *
 * **Toute nouvelle section a son `loading.tsx`** — règle du dépôt, mesurée :
 * 425 ms de clic figé sans frontière, 23 ms avec. C'est elle qui rend la route
 * préchargeable depuis les lignes de l'accueil : sans elle, Next ne précharge
 * pas une route dynamique, et le clic attendrait l'aller-retour serveur.
 */
export default function ChargementSujet() {
  return (
    <div className="page-admin">
      <Squelettes lignes={4} />
    </div>
  );
}
