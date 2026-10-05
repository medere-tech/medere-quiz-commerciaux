'use client';

import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';

import { authentification } from '@/lib/firebase/client';
import { baseDeDonnees } from '@/lib/firebase/firestore';
import { ErreurPresentation, type Presentation } from '@/lib/sujets/presentation';

export type { Presentation };

/**
 * Les sujets et leurs présentations, vus du back-office.
 *
 * **La présentation d'un sujet se saisit ici, et nulle part ailleurs.** Elle
 * vit sous `presentations/{sujetId}`, à part du miroir `sujets/` que la
 * synchronisation réécrit chaque nuit. Les règles n'en ouvrent la lecture et
 * l'écriture qu'à l'équipe pédagogique ; les commerciaux la reçoivent par le
 * serveur, avec la page du sujet.
 */

/** Limite d'un filtre `in` chez Firestore. */
const VALEURS_PAR_REQUETE = 30;

async function parLots<T>(
  ids: readonly string[],
  lire: (lot: string[]) => Promise<[string, T][]>,
): Promise<Map<string, T>> {
  const uniques = [...new Set(ids)];
  const lots = await Promise.all(
    Array.from({ length: Math.ceil(uniques.length / VALEURS_PAR_REQUETE) }, (_, index) =>
      lire(uniques.slice(index * VALEURS_PAR_REQUETE, (index + 1) * VALEURS_PAR_REQUETE)),
    ),
  );
  return new Map(lots.flat());
}

/** Le nom des sujets demandés. Un sujet introuvable est simplement absent. */
export function chargerNomsDeSujets(ids: readonly string[]): Promise<Map<string, string>> {
  return parLots(ids, async (lot) => {
    const instantane = await getDocs(
      query(collection(baseDeDonnees(), 'sujets'), where(documentId(), 'in', lot)),
    );
    return instantane.docs
      .filter((document) => typeof document.get('nom') === 'string')
      .map((document) => [document.id, document.get('nom') as string]);
  });
}

/** Les présentations des sujets demandés. */
export function chargerPresentations(ids: readonly string[]): Promise<Map<string, Presentation>> {
  return parLots(ids, async (lot) => {
    const instantane = await getDocs(
      query(collection(baseDeDonnees(), 'presentations'), where(documentId(), 'in', lot)),
    );
    return instantane.docs.flatMap((document): [string, Presentation][] => {
      const url = document.get('url');
      const presenteeLe = document.get('presenteeLe');
      if (typeof url !== 'string' || !(presenteeLe instanceof Timestamp)) return [];
      const presentePar = document.get('presentePar');
      return [
        [
          document.id,
          {
            url,
            presenteeLe: presenteeLe.toDate(),
            presentePar: typeof presentePar === 'string' ? presentePar : '',
          },
        ],
      ];
    });
  });
}


/**
 * Enregistre la présentation d'un sujet. L'auteur n'est pas un paramètre : c'est
 * le nom que porte le jeton de la personne connectée, et les règles le
 * vérifient — une donnée qu'on peut déduire ne se ressaisit pas.
 */
export async function enregistrerPresentation(
  sujetId: string,
  url: string,
  presenteeLe: Date,
): Promise<Presentation> {
  const utilisateur = authentification().currentUser;
  if (!utilisateur) throw new ErreurPresentation('Votre session a expiré. Reconnectez-vous.');

  const { claims } = await utilisateur.getIdTokenResult();
  const nom = typeof claims.name === 'string' ? claims.name.trim() : '';
  if (nom.length === 0) {
    throw new ErreurPresentation(
      'Votre compte Google ne porte pas de nom : la présentation ne peut pas être signée.',
    );
  }

  await setDoc(doc(baseDeDonnees(), 'presentations', sujetId), {
    url: url.trim(),
    presenteeLe: Timestamp.fromDate(presenteeLe),
    presentePar: nom,
    majLe: serverTimestamp(),
  });
  return { url: url.trim(), presenteeLe, presentePar: nom };
}

export async function retirerPresentation(sujetId: string): Promise<void> {
  await deleteDoc(doc(baseDeDonnees(), 'presentations', sujetId));
}
