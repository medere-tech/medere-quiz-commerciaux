import { SeancesCollectives } from '@/composants/session/SeancesCollectives';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/**
 * Page 7 · Séances prêtes et passées — la racine de la section.
 *
 * **La maquette sépare consulter et composer**, et cette route est la
 * première : c'est elle que la navigation atteint, et c'est d'ici qu'on
 * prépare. Composer vit sur `/admin/session/composer`, le détail d'une séance
 * passée sur `/admin/session/{id}`.
 */
export default async function PageSeancesCollectives() {
  const referentiel = await chargerReferentielSiConnecte();
  // Personne n'est connecté : la disposition rend l'écran de connexion, et
  // ce que cette page renvoie est écarté. On ne charge donc rien.
  if (!referentiel) return null;

  return <SeancesCollectives referentiel={referentiel} />;
}
