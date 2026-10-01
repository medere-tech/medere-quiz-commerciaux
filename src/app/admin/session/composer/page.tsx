import { ComposerSeance } from '@/composants/session/ComposerSeance';
import { lireSession } from '@/lib/auth/session-serveur';
import { chargerTauxQuestions } from '@/lib/serveur/maitrise-equipe';
import { chargerReferentiel } from '@/lib/serveur/referentiel';

/**
 * Page 7 · Composer une séance.
 *
 * Deux entrées possibles, toutes deux par la barre d'adresse :
 * `?reprendre={id}` rouvre une séance préparée, `?ratees=a,b,c` part des
 * questions qui ont trébuché lors d'une séance passée.
 *
 * Les taux d'échec viennent du serveur, par la même fonction que les
 * statistiques, et partent en promesse : la banque s'affiche sans les attendre.
 */
export default async function PageComposerSeance({
  searchParams,
}: {
  searchParams: Promise<{ reprendre?: string; ratees?: string }>;
}) {
  // Pas d'administrateur connecté : la disposition rend l'écran de connexion
  // ou le refus, et ce que cette page renvoie est écarté. On ne lit rien —
  // `chargerTauxQuestions` lèverait, et sa promesse rejetée resterait orpheline.
  const session = await lireSession();
  if (!session?.admin) return null;

  const stats = chargerTauxQuestions();
  const referentiel = await chargerReferentiel();
  const parametres = await searchParams;
  const ratees = parametres.ratees?.split(',').filter((valeur) => valeur !== '');

  return (
    <ComposerSeance
      referentiel={referentiel}
      stats={stats}
      reprise={parametres.reprendre}
      ratees={ratees}
    />
  );
}
