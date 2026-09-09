'use client';

import { collection, getDocs } from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/client';
import { enStats, type StatsQuestion } from '@/lib/statistiques/modele';

/**
 * Lecture des statistiques agrégées.
 *
 * **La collection ne porte aucun identifiant d'utilisateur.** Elle est écrite
 * par la Cloud Function d'agrégation, qui ne reçoit qu'un identifiant de
 * question et un verdict. Il n'existe donc, structurellement, aucune requête
 * capable de dire qui a raté quoi : ce n'est pas un filtre d'affichage qu'on
 * pourrait contourner, c'est une donnée qui n'a jamais été écrite.
 *
 * Les règles réservent la lecture à l'administrateur et interdisent
 * l'écriture à tout client.
 *
 * **Pourquoi tout charger.** Le classement se fait sur le taux d'échec, qui
 * n'est pas un champ stocké : `echecs / tentatives` se calcule à la lecture,
 * et Firestore ne sait pas trier sur une expression. Sur une banque de
 * quelques centaines de questions, la lecture complète coûte moins qu'un
 * champ dénormalisé à tenir cohérent depuis la fonction.
 */

export async function chargerStatistiques(): Promise<StatsQuestion[]> {
  const instantane = await getDocs(collection(baseDeDonnees(), 'questionStats'));

  return instantane.docs.map((document) => enStats(document.id, document.data()));
}
