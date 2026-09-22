import { SeancePasseeEcran } from '@/composants/session/SeancePasseeEcran';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/**
 * Page 7 · Le détail d'une séance passée, en écran entier.
 *
 * **La maquette en fait une vue à part sous 1200 px**, atteinte en cliquant
 * une ligne de l'historique. Au-delà, le même détail vit en panneau dans la
 * liste — mais la route existe à toutes les largeurs : un lien vers une séance
 * précise doit mener quelque part.
 */
export default async function PageSeancePassee({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const referentiel = await chargerReferentielSiConnecte();
  if (!referentiel) return null;

  const { id } = await params;
  return <SeancePasseeEcran seanceId={id} referentiel={referentiel} />;
}
