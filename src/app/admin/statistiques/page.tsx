import { lireSession } from '@/lib/auth/session-serveur';
import { chargerMaitriseEquipe } from '@/lib/serveur/maitrise-equipe';

import { EcranStatistiques } from './EcranStatistiques';

/**
 * 09 · Statistiques.
 *
 * La page lit, côté serveur, la maîtrise de chaque commercial pour le bloc
 * « Maîtrise par commercial ». Le reste de l'écran — les taux anonymes de
 * `questionStats` — continue de se lire dans le navigateur.
 *
 * **La page n'attend pas cette lecture.** Elle part au navigateur en
 * promesse, que seul le bloc lit, sous `Suspense` : les lectures du navigateur
 * démarrent sans attendre le serveur, et le bloc se remplit quand sa donnée
 * arrive. L'attendre ici faisait payer à tout l'écran le prix d'un bloc.
 *
 * **Seul ce que le bloc affiche part au navigateur** : l'identifiant, le nom
 * et le pourcentage. Le détail par formation reste sur le serveur tant qu'aucun
 * écran ne le montre.
 */
export default async function PageStatistiques() {
  // Pas d'administrateur connecté : la disposition rend l'écran de connexion
  // ou le refus, et ce que cette page renvoie est écarté. On ne lit rien.
  const session = await lireSession();
  if (!session?.admin) return null;

  const equipe = chargerMaitriseEquipe().then(({ commerciaux }) =>
    commerciaux.map((commercial) => ({
      uid: commercial.uid,
      nom: commercial.nom,
      pourcentage: commercial.maitrise.pourcentage,
    })),
  );

  return <EcranStatistiques equipe={equipe} />;
}
