'use client';

import { preparerPanne, type Origine, type PanneSignalee } from '@/lib/journal/redaction';

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
 * défaut qu'on répare. D'où la déduplication, le plafond de débit, et l'envoi
 * silencieux. Le serveur ne limite rien : ce plafond est le seul rempart.
 *
 * **Le plafond est un débit, pas un quota à vie.** Il valait cinq signalements
 * par chargement de page, toutes origines confondues. Or la séance du jeudi
 * est un seul écran ouvert une heure devant dix personnes : cinq pannes
 * bénignes en début de séance, et tout ce qui suivait était muet — là même où
 * l'on a le plus besoin de voir ce qui tombe. Il vaut désormais cinq
 * signalements **par origine** sur toute fenêtre de soixante secondes : une
 * rafale de ressources n'étouffe plus un refus d'écriture, et le silence ne
 * dure jamais plus d'une minute. Au pire, une boucle coûte vingt-cinq lignes
 * par minute et par poste — on voit trop plutôt que pas assez.
 *
 * **Et il dit ce qu'il a retenu.** Un plafond muet laisse croire que le
 * journal est complet, comme un `catch` qui mange l'erreur. Ce qu'il écarte
 * est compté, et le compte part dès que la fenêtre se rouvre, ou au départ de
 * la page s'il n'en a pas eu le temps.
 */

/** Signalements admis par origine sur une fenêtre glissante. */
export const PAR_FENETRE = 5;
export const FENETRE_MS = 60_000;

const dejaVues = new Set<string>();
/** Instants des envois de la fenêtre en cours, par origine. */
const envois = new Map<Origine, number[]>();
/** Ce que le plafond a écarté depuis le dernier compte rendu, par origine. */
const ecartes = new Map<Origine, number>();
const minuteries = new Map<Origine, ReturnType<typeof setTimeout>>();

/** Réserve une place dans la fenêtre de l'origine, s'il en reste une. */
function reserver(origine: Origine): boolean {
  const maintenant = Date.now();
  const recents = (envois.get(origine) ?? []).filter((instant) => maintenant - instant < FENETRE_MS);
  envois.set(origine, recents);
  if (recents.length >= PAR_FENETRE) return false;
  recents.push(maintenant);
  return true;
}

/** Le compte de ce qui a été écarté, sous la forme d'un signalement ordinaire. */
function compteRendu(origine: Origine, nombre: number) {
  const pluriel = nombre > 1 ? 's' : '';
  return preparerPanne({
    origine,
    message:
      `${nombre} signalement${pluriel} écarté${pluriel} par le plafond ` +
      `(${PAR_FENETRE} par minute et par origine)`,
    chemin: window.location.pathname,
  });
}

/**
 * Envoie le compte des signalements écartés. `force` ignore le plafond : au
 * départ de la page, il n'y aura pas d'autre occasion, et c'est une ligne par
 * origine au plus.
 */
function rendreCompte(origine: Origine, force = false): void {
  const nombre = ecartes.get(origine) ?? 0;
  if (nombre === 0) return;
  if (!force && !reserver(origine)) {
    programmerCompteRendu(origine);
    return;
  }
  ecartes.delete(origine);
  const panne = compteRendu(origine, nombre);
  if (panne) envoyer(panne);
}

/** Rend compte quand la plus ancienne place de la fenêtre se libère. */
function programmerCompteRendu(origine: Origine): void {
  if (minuteries.has(origine)) return;
  const plusAncien = envois.get(origine)?.[0] ?? Date.now();
  const delai = Math.max(0, plusAncien + FENETRE_MS - Date.now());
  minuteries.set(
    origine,
    setTimeout(() => {
      minuteries.delete(origine);
      rendreCompte(origine);
    }, delai),
  );
}

if (typeof window !== 'undefined') {
  // `pagehide` plutôt que `unload` : il est émis aussi quand la page part en
  // cache de navigation, et `sendBeacon` est fait pour ce moment-là.
  window.addEventListener('pagehide', () => {
    for (const origine of ecartes.keys()) rendreCompte(origine, true);
  });
}

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

  // Un compte en souffrance passe avant la panne qui rouvre la fenêtre : il
  // dit ce qui manque entre la dernière ligne et celle-ci.
  rendreCompte(panne.origine);

  if (!reserver(panne.origine)) {
    // Pas marquée comme vue : si elle revient après le plafond, elle passera.
    ecartes.set(panne.origine, (ecartes.get(panne.origine) ?? 0) + 1);
    programmerCompteRendu(panne.origine);
    return;
  }

  dejaVues.add(empreinte);
  envoyer(panne);
}

function envoyer(panne: PanneSignalee): void {
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
