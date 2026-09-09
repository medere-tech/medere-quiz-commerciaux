'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Préchargement d'une route à la première marque d'intention.
 *
 * **Pour quoi faire.** `<Link>` précharge tout seul dès qu'il entre dans le
 * champ, et c'est la bonne réponse partout où la navigation est un lien. Reste
 * ce qui ne peut pas en être un : une ligne de tableau qu'on ouvre au clic,
 * une carte entière cliquable. Là, on précharge au premier signe — survol à la
 * souris, premier contact au doigt, arrivée au clavier — c'est-à-dire quelques
 * centaines de millisecondes avant le clic. Sur une route dynamique, mesurée à
 * 500 ms d'aller-retour, cela suffit à ce que le clic n'attende plus rien.
 *
 * `router.prefetch` demande la route entière et la garde cinq minutes, là où
 * le préchargement automatique d'un `<Link>` sur route dynamique dépend de
 * `experimental.staleTimes.dynamic` — trente secondes ici.
 *
 * Le doigt déclenche sur `touchstart`, pas sur le clic : entre le contact et
 * le relâchement, il se passe couramment 100 ms qu'on récupère.
 *
 * Chaque route n'est demandée qu'une fois par montage : parcourir une liste de
 * cent lignes à la souris ne doit pas produire cent requêtes.
 */
export function useIntentionDeNavigation(): (route: Route) => {
  onMouseEnter: () => void;
  onTouchStart: () => void;
  onFocus: () => void;
} {
  const routeur = useRouter();
  const dejaDemandees = useRef<Set<string>>(new Set());

  return useCallback(
    (route: Route) => {
      const declencher = () => {
        if (dejaDemandees.current.has(route)) return;
        dejaDemandees.current.add(route);
        routeur.prefetch(route);
      };

      return { onMouseEnter: declencher, onTouchStart: declencher, onFocus: declencher };
    },
    [routeur],
  );
}

/**
 * Préchargement d'une sortie certaine, dès l'affichage de l'écran.
 *
 * Il y a des destinations qu'on sait d'avance : d'une série on revient à
 * l'accueil, de l'éditeur on revient à la banque. Attendre le survol n'a pas
 * de sens — l'aller-retour peut être payé pendant que le commercial répond aux
 * questions, c'est-à-dire pendant plusieurs minutes où le réseau ne fait rien.
 *
 * Réservé aux sorties qui ne dépendent d'aucune donnée : une route calculée à
 * partir d'un identifiant qu'on n'a pas encore ne se précharge pas.
 */
export function usePrechargementCertain(route: Route): void {
  const routeur = useRouter();

  useEffect(() => {
    routeur.prefetch(route);
  }, [routeur, route]);
}
