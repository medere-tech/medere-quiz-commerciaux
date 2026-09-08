'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Comportement clavier d'un panneau superposé.
 *
 * **Le défaut qu'il corrige.** Un panneau qui se pose par-dessus la page sans
 * rendre le fond inerte laisse la tabulation continuer derrière lui : on
 * quitte le panneau sans le voir, on agit sur des commandes masquées, et rien
 * ne dit qu'on en est sorti. Pour qui navigue au clavier, c'est un panneau
 * cassé — pas une finition manquante.
 *
 * **Trois obligations, tenues ici une fois pour toutes.**
 *
 * 1. Le fond devient inerte tant que le panneau est ouvert. On s'appuie sur
 *    l'attribut `inert` du navigateur plutôt que sur une gestion maison de la
 *    tabulation : il retire réellement les éléments de l'ordre de tabulation,
 *    du pointeur et de l'arbre d'accessibilité. Le cycle à l'intérieur du
 *    panneau devient alors le comportement natif, sans code.
 * 2. Le focus entre dans le panneau à l'ouverture, sur son premier élément
 *    focalisable.
 * 3. Il revient à l'élément d'origine à la fermeture. Sans cela, on repart du
 *    haut du document à chaque ouverture.
 *
 * Échap reste géré par l'appelant : lui seul sait ce que « fermer » veut dire.
 * De même, tout élément portant `data-superpose` — un voile, typiquement —
 * échappe à l'inertie : il appartient au panneau, pas au fond.
 */

const FOCALISABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function usePanneauSuperpose(
  ouvert: boolean,
  panneau: RefObject<HTMLElement | null>,
): void {
  // L'élément qui avait le focus avant l'ouverture, pour le lui rendre.
  const origine = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = panneau.current;
    if (!ouvert || !element) return;

    origine.current = document.activeElement as HTMLElement | null;

    /**
     * Tout ce qui n'est pas sur le chemin du panneau devient inerte : à
     * chaque niveau, du panneau jusqu'à `body`, on neutralise les frères.
     * Seuls ceux qu'on a rendus inertes sont rétablis ensuite — un élément
     * déjà inerte pour une autre raison le reste.
     */
    const neutralises: HTMLElement[] = [];

    for (let noeud = element; noeud.parentElement; noeud = noeud.parentElement) {
      for (const frere of Array.from(noeud.parentElement.children)) {
        if (frere === noeud || !(frere instanceof HTMLElement)) continue;
        // Le voile ferme le panneau : le rendre inerte le rendrait aussi
        // insensible au clic, et on n'aurait plus qu'Échap pour sortir.
        if (frere.hasAttribute('data-superpose')) continue;
        if (frere.hasAttribute('inert')) continue;
        frere.setAttribute('inert', '');
        neutralises.push(frere);
      }
    }

    /**
     * Le premier élément focalisable *affiché*.
     *
     * Le premier au sens du sélecteur ne suffit pas : le panneau porte des
     * commandes que la feuille de style masque selon la largeur — le bouton
     * de repli n'existe qu'au bureau. Appeler `focus()` sur un élément en
     * `display: none` ne fait rien, sans erreur, et le focus reste sur le
     * fond qu'on vient de rendre inerte : plus rien ne répond au clavier.
     */
    const premier = Array.from(element.querySelectorAll<HTMLElement>(FOCALISABLES)).find(
      (candidat) => candidat.getClientRects().length > 0,
    );

    // À défaut d'élément focalisable, le panneau lui-même reçoit le focus :
    // on ne laisse jamais le focus derrière, sur un fond devenu inerte.
    if (premier) premier.focus();
    else {
      element.setAttribute('tabindex', '-1');
      element.focus();
    }

    return () => {
      for (const frere of neutralises) frere.removeAttribute('inert');
      origine.current?.focus?.();
    };
  }, [ouvert, panneau]);
}
