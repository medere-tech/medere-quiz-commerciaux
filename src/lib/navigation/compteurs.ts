'use client';

import { getCountFromServer, collection, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { baseDeDonnees } from '@/lib/firebase/firestore';
import { authentification } from '@/lib/firebase/client';
import { STATUTS_SERVIS } from '@/lib/questions/modele';

/**
 * Les compteurs de la barre de navigation.
 *
 * **La maquette en pose deux**, et ils ne sont pas décoratifs : « À revoir · 12 »
 * dit au commercial qu'il a du retard sans qu'il ait à ouvrir l'écran, et
 * « Banque de questions · 214 » dit à Noémie la taille de ce qu'elle gère.
 *
 * **Deux requêtes d'agrégation, jamais deux lectures de collection.**
 * `getCountFromServer` renvoie un nombre sans rapatrier les documents : le
 * compteur coûte une unité de lecture, pas une par question. C'est ce qui rend
 * acceptable de le poser sur *toutes* les pages de la coquille.
 *
 * Un compteur qu'on ne sait pas calculer ne s'affiche pas — ni zéro, ni tiret.
 * Un nombre faux est pire qu'un nombre absent.
 */

/**
 * Questions servies : ce que la banque gère et ce qui entre dans les séries.
 *
 * **Servies, et non publiées.** Depuis le troisième statut, « à relire » sort
 * aux commerciaux comme « publiée » — voir `STATUTS_SERVIS`. Le compteur porte
 * donc le nom de ce qu'il compte : un nom qui désigne un sous-ensemble finit
 * par produire une phrase d'écran fausse, et personne ne la relit.
 */
export function useNombreDeQuestionsServies(): number | null {
  const [nombre, setNombre] = useState<number | null>(null);

  useEffect(() => {
    let vivant = true;
    getCountFromServer(
      query(collection(baseDeDonnees(), 'questions'), where('statut', 'in', [...STATUTS_SERVIS])),
    )
      .then((agregat) => {
        if (vivant) setNombre(agregat.data().count);
      })
      .catch((panne: unknown) => {
        /* Un compteur de navigation n'est pas une panne d'écran : on le
           journalise et on ne l'affiche pas. */
        const code = (panne as { code?: string })?.code;
        console.error(`Compteur des questions servies indisponible${code ? ` (${code})` : ''}`, panne);
      });
    return () => {
      vivant = false;
    };
  }, []);

  return nombre;
}

/** Questions dont la dernière réponse du commercial était fausse. */
export function useNombreDeRatees(): number | null {
  const [nombre, setNombre] = useState<number | null>(null);

  useEffect(() => {
    let vivant = true;
    const arreter = authentification().onAuthStateChanged((utilisateur) => {
      if (!utilisateur) {
        setNombre(null);
        return;
      }
      getCountFromServer(
        query(
          collection(baseDeDonnees(), 'users', utilisateur.uid, 'etats'),
          where('derniereRatee', '==', true),
        ),
      )
        .then((agregat) => {
          if (vivant) setNombre(agregat.data().count);
        })
        .catch((panne: unknown) => {
          const code = (panne as { code?: string })?.code;
          console.error(`Compteur des questions à revoir indisponible${code ? ` (${code})` : ''}`, panne);
        });
    });
    return () => {
      vivant = false;
      arreter();
    };
  }, []);

  return nombre;
}
