'use client';

import { useCallback, useMemo } from 'react';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * L'état d'une liste vit dans l'URL.
 *
 * **Pourquoi là et pas dans un état React.** Noémie ouvre une question, la
 * corrige, revient. Si le filtre, le tri et le nombre de lignes chargées
 * vivaient dans un composant, ils seraient perdus au retour, et elle
 * refiltrerait et redéfilerait à chaque aller-retour. Trois cents questions,
 * c'est le genre de friction qui fait abandonner un outil.
 *
 * L'URL est le seul endroit qui survive à la navigation sans stockage : ni
 * `localStorage` ni `sessionStorage`, que ce projet s'interdit. Elle a deux
 * avantages de plus, gratuits : le rechargement de page retombe sur la même
 * vue, et une recherche se partage par un lien.
 *
 * Une valeur égale à son défaut n'est pas écrite : l'URL reste courte, et
 * `/admin/questions` désigne toujours la vue par défaut.
 *
 * `defauts` est attendu constant — une constante de module. Sa signature
 * sérialisée sert de dépendance : deux objets distincts portant les mêmes
 * valeurs ne relancent rien.
 */
export function useParametresUrl<T extends Record<string, string>>(
  defauts: T,
): {
  valeurs: T;
  definir: (modifications: Partial<T>) => void;
  /** La requête courante, telle quelle, pour la transmettre à un autre écran. */
  chaine: string;
} {
  const routeur = useRouter();
  const chemin = usePathname();
  const parametres = useSearchParams();

  const chaine = parametres.toString();
  const signature = JSON.stringify(defauts);

  const valeurs = useMemo(() => {
    const lus = new URLSearchParams(chaine);
    return Object.fromEntries(
      Object.keys(defauts).map((cle) => [cle, lus.get(cle) ?? defauts[cle]]),
    ) as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaine, signature]);

  const definir = useCallback(
    (modifications: Partial<T>) => {
      const suivants = new URLSearchParams(chaine);

      for (const [cle, valeur] of Object.entries(modifications)) {
        if (valeur === undefined) continue;
        if (valeur === defauts[cle]) suivants.delete(cle);
        else suivants.set(cle, valeur);
      }

      const requete = suivants.toString();

      // `replace` plutôt que `push` : filtrer n'est pas une étape de
      // navigation, et l'historique ne doit pas se remplir d'une entrée par
      // lettre tapée dans la recherche.
      //
      // L'adresse est composée, donc invisible aux routes typées de Next : la
      // partie qui varie est la requête, pas le chemin.
      routeur.replace(`${chemin}${requete ? `?${requete}` : ''}` as Route, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chaine, chemin, routeur, signature],
  );

  return { valeurs, definir, chaine };
}

/**
 * Nombre entier lu dans l'URL, ramené dans des bornes.
 *
 * Une URL se modifie à la main, et `?vus=-4` ou `?vus=abc` ne doivent pas
 * casser un écran.
 */
export function entierBorne(valeur: string, defaut: number, minimum: number): number {
  const nombre = Number.parseInt(valeur, 10);
  if (!Number.isFinite(nombre) || nombre < minimum) return defaut;
  return nombre;
}
