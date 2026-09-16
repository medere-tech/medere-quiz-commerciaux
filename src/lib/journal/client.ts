'use client';

import { preparerPanne, type Origine } from '@/lib/journal/redaction';

/**
 * Signalement des pannes survenues dans le navigateur.
 *
 * **Le trou que ça ferme.** `onRequestError` couvre le serveur. Une panne dans
 * un composant client — l'éditeur de questions, l'écran de séance, la
 * révélation du classement — n'écrivait que dans la console du commercial. Or
 * c'est la moitié qui tourne le jeudi, sur dix téléphones à la fois, et les
 * trois défauts trouvés en séance réelle au lot 7 étaient tous de ce
 * côté-là. Le digest affiché sur l'écran de panne ne sert que si quelqu'un
 * pense à le dire.
 *
 * **Pourquoi pas un outil du marché.** Mesuré : le paquet navigateur minimal de
 * Sentry pèse **29,8 ko gzip**, trois fois la régression consentie pour les
 * écrans de panne eux-mêmes, sur chaque écran. Et il collecte par défaut ce
 * qu'on ne veut surtout pas remonter — le texte des éléments cliqués, les
 * valeurs de formulaire, les corps de requête. Le désarmer champ par champ est
 * une politique à écrire puis à maintenir à chaque montée de version. Pour dix
 * utilisateurs, une seule application et un journal serveur déjà collecté par
 * Vercel, le rapport n'y est pas.
 *
 * Ici : un module d'environ une page, aucune dépendance, et **la liste de ce
 * qui part tient en cinq champs** — origine, message, pile, chemin, digest.
 *
 * **Trois garde-fous contre le bavardage.** Une panne qui se répète en boucle
 * — un effet qui relance un rendu qui relance l'effet — remplirait le journal
 * en quelques secondes et noierait tout le reste, ce qui est précisément le
 * défaut qu'on répare. D'où la déduplication, le plafond par chargement, et
 * l'envoi silencieux.
 */

/** Au-delà, on a compris : il se passe quelque chose, et on ne l'apprend plus. */
const SIGNALEMENTS_MAX = 5;

const dejaVues = new Set<string>();
let envoyes = 0;

export function signalerPanne(
  origine: Origine,
  erreur: unknown,
  digest?: string,
): void {
  if (typeof window === 'undefined') return;

  const panne = preparerPanne({
    origine,
    message: erreur instanceof Error ? erreur.message : String(erreur),
    pile: erreur instanceof Error ? (erreur.stack ?? '') : '',
    chemin: window.location.pathname,
    digest: digest ?? (erreur as { digest?: string } | null)?.digest,
  });

  if (!panne) return;

  const empreinte = `${panne.origine}|${panne.message}|${panne.chemin}`;
  if (dejaVues.has(empreinte)) return;
  if (envoyes >= SIGNALEMENTS_MAX) return;

  dejaVues.add(empreinte);
  envoyes += 1;

  const corps = JSON.stringify(panne);

  /*
   * `sendBeacon` d'abord : il survit à la fermeture de l'onglet et à la
   * navigation qui suit souvent une panne. Il n'est pas toujours disponible —
   * ni toujours accepté quand la file est pleine —, d'où le repli sur `fetch`
   * avec `keepalive`, qui a la même propriété.
   */
  try {
    const paquet = new Blob([corps], { type: 'application/json' });
    if (navigator.sendBeacon?.('/api/journal-client', paquet)) return;
  } catch {
    // `sendBeacon` peut lever selon le type MIME et la politique du navigateur.
  }

  void fetch('/api/journal-client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: corps,
    keepalive: true,
  }).catch(() => {
    // Un signalement qui n'aboutit pas ne doit rien casser ni rien dire : la
    // panne d'origine est déjà à l'écran, et c'est elle qui compte.
  });
}
