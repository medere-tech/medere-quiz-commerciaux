'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

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
 * **Filtrer n'est pas naviguer, et cela se paie au routeur.** `router.replace`
 * change bien l'adresse, mais il fait aussi ce que fait toute navigation : il
 * redemande au serveur la charge du segment. Or ces écrans rendent leur
 * référentiel au serveur — la banque entière, lue par le SDK Admin — puis le
 * passent en propriété à un composant client qui relit les états et la
 * progression dans Firestore. **Cocher un onglet de format rejouait donc la
 * chaîne complète**, pour un tri qui se fait sur des données déjà en mémoire.
 *
 * `window.history.replaceState` change l'adresse **sans** passer par le
 * routeur : aucune requête, aucun nouveau rendu serveur. Mesuré : zéro requête
 * là où l'onglet en coûtait quatre.
 *
 * **Mais l'adresse seule ne suffit pas à redessiner l'écran, et le navigateur
 * l'a montré.** La documentation de Next annonce que `pushState` et
 * `replaceState` « s'intègrent au routeur » pour que `usePathname` et
 * `useSearchParams` portent la nouvelle valeur. En 16.3.4, sur une page
 * dynamique, `useSearchParams` ne provoque aucun rendu : l'adresse passait à
 * `?format=vf`, l'onglet actif restait « Tous les formats » et la liste ne se
 * filtrait plus. **Le filtre était cassé, en silence, et rien dans le code ne
 * le disait.**
 *
 * La valeur courante vit donc dans un état React, semé depuis l'adresse. Trois
 * sources, dans cet ordre de priorité : ce que l'écran vient de choisir, ce
 * qu'une vraie navigation apporte, ce que l'adresse portait au montage. Les
 * flèches du navigateur restent maîtresses — `popstate` reprend l'adresse.
 *
 * **Ce que cela suppose des pages qui s'en servent**, et qui est vrai pour les
 * quatre : aucune ne lit `searchParams` côté serveur. Une page qui le ferait
 * ne verrait pas le changement — il faudrait alors une vraie navigation, et
 * c'est la seule raison qui justifierait de revenir au routeur ici.
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
  const chemin = usePathname();
  const parametres = useSearchParams();

  const depuisRouteur = parametres.toString();
  /*
   * `null` veut dire « rien n'a été choisi sur cet écran » : l'adresse fait
   * foi. Dès qu'on choisit, c'est cet état qui redessine — `replaceState` ne
   * déclenche aucun rendu, et c'est tout le problème qu'il résout et qu'il
   * crée à la fois.
   */
  const [choisie, setChoisie] = useState<string | null>(null);
  const chaine = choisie ?? depuisRouteur;
  const signature = JSON.stringify(defauts);

  /*
   * Une vraie navigation reprend la main : un lien vers le même écran avec
   * d'autres paramètres ne doit pas se faire écraser par un choix précédent.
   *
   * Ajusté pendant le rendu plutôt que dans un effet — c'est le motif que React
   * prescrit pour remettre un état à zéro quand une entrée change : le rendu
   * qui suit part de la bonne valeur, sans passer par un affichage
   * intermédiaire qui montrerait l'ancien filtre le temps d'une image.
   */
  const [vuDuRouteur, setVuDuRouteur] = useState(depuisRouteur);
  if (vuDuRouteur !== depuisRouteur) {
    setVuDuRouteur(depuisRouteur);
    setChoisie(null);
  }

  /* Et les flèches du navigateur aussi. `replaceState` n'empile rien, mais
     l'écran peut être atteint après un aller-retour : c'est l'adresse qui
     décide, pas ce qu'on avait choisi avant de partir. */
  useEffect(() => {
    const surRetour = () => setChoisie(window.location.search.replace(/^\?/, ''));
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, []);

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

      // `replaceState` plutôt que `pushState` : filtrer n'est pas une étape de
      // navigation, et l'historique ne doit pas se remplir d'une entrée par
      // lettre tapée dans la recherche.
      /*
       * L'état d'abord — c'est lui qui redessine —, l'adresse ensuite, pour
       * qu'un rechargement retombe sur la même vue et qu'une recherche se
       * partage par un lien.
       */
      setChoisie(requete);
      window.history.replaceState(null, '', `${chemin}${requete ? `?${requete}` : ''}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chaine, chemin, signature],
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
