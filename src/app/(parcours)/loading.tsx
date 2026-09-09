import { Squelettes } from '@/composants/ds/etats';

/**
 * Frontière de chargement de l'espace commercial.
 *
 * **Ce n'est pas qu'un écran d'attente.** C'est ce qui rend la route
 * préchargeable : sans `loading`, Next refuse de précharger une route
 * dynamique — le clic paie alors un aller-retour serveur complet, mesuré à
 * 500 ms de médiane en production pour 1,4 ko de charge utile. Avec cette
 * frontière, la coquille et la structure partent à l'avance, dès que le lien
 * entre dans le champ, et le clic n'attend plus que les données.
 *
 * Les squelettes sont ceux du système de design : même carte, même rythme que
 * l'accueil et les questions à revoir, pour que la bascule ne se voie pas.
 */
export default function ChargementParcours() {
  return (
    <div className="page-admin">
      <Squelettes lignes={5} />
    </div>
  );
}
