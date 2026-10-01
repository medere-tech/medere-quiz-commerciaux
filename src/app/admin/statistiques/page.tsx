import { lireSession } from '@/lib/auth/session-serveur';
import { chargerMaitriseEquipe } from '@/lib/serveur/maitrise-equipe';

import { EcranStatistiques } from './EcranStatistiques';

/**
 * 09 · Statistiques.
 *
 * La page lit, côté serveur, les états des commerciaux. Une seule lecture en
 * tire deux choses : la maîtrise de chacun, pour le bloc « Maîtrise par
 * commercial », et les taux d'échec par question, pour la liste — des totaux
 * sans nom (`agregerEtats`). La banque et les formations continuent de se lire
 * dans le navigateur.
 *
 * **La page n'attend pas cette lecture.** Elle part au navigateur en deux
 * promesses : le bloc lit la sienne sous `Suspense`, la liste attend la sienne
 * avec la banque. L'attendre ici ferait payer au titre et à la navigation le
 * prix d'une lecture qu'ils n'affichent pas.
 *
 * **Seul ce que l'écran affiche part au navigateur** : l'identifiant, le nom
 * et le pourcentage de chaque commercial, et les totaux par question. Le
 * détail par formation reste sur le serveur tant qu'aucun écran ne le montre.
 */
export default async function PageStatistiques() {
  // Pas d'administrateur connecté : la disposition rend l'écran de connexion
  // ou le refus, et ce que cette page renvoie est écarté. On ne lit rien.
  const session = await lireSession();
  if (!session?.admin) return null;

  const lecture = chargerMaitriseEquipe();
  const equipe = lecture.then(({ commerciaux }) =>
    commerciaux.map((commercial) => ({
      uid: commercial.uid,
      nom: commercial.nom,
      pourcentage: commercial.maitrise.pourcentage,
    })),
  );
  const stats = lecture.then(({ parQuestion }) => parQuestion);

  return <EcranStatistiques equipe={equipe} stats={stats} />;
}
