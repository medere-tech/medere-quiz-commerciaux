import { lireSession } from '@/lib/auth/session-serveur';
import { chargerMaitriseEquipe } from '@/lib/serveur/maitrise-equipe';

import { EcranFormations } from './EcranFormations';

/**
 * 11 · Formations.
 *
 * La page lit, côté serveur, la maîtrise d'équipe de chaque formation — le
 * chiffre « maîtrise équipe » des cartes. Le reste de l'écran — le référentiel,
 * les comptes de questions — continue de se lire dans le navigateur.
 *
 * **La page n'attend pas cette lecture** : elle part en promesse, lue carte par
 * carte sous `Suspense`. Les cartes s'affichent sur leurs propres lectures, le
 * chiffre les rejoint quand il arrive.
 *
 * Une formation sans question servie, ou une équipe sans commercial, n'a pas
 * de chiffre : un « 0 % » dirait que l'équipe ne sait rien, alors qu'il n'y a
 * rien à savoir, ou personne pour le savoir.
 */
export default async function PageFormations() {
  // Pas d'administrateur connecté : la disposition rend la connexion ou le
  // refus, et ce que cette page renvoie est écarté. On ne lit rien.
  const session = await lireSession();
  if (!session?.admin) return null;

  const maitriseEquipe = chargerMaitriseEquipe().then(({ commerciaux, parFormation }) => {
    const parId: Record<string, number> = {};
    if (commerciaux.length > 0) {
      for (const ligne of parFormation) parId[ligne.formationId] = ligne.pourcentage;
    }
    return parId;
  });

  return <EcranFormations maitriseEquipe={maitriseEquipe} />;
}
