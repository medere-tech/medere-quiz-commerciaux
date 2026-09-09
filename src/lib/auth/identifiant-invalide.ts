/**
 * Distinguer un identifiant invalide d'une panne.
 *
 * **Pas de `server-only` ici.** Ce module ne contient qu'une liste de codes
 * d'erreur et un prédicat : ni secret, ni API serveur. La directive
 * l'aurait rendu intestable, alors que c'est précisément la frontière qui
 * mérite des tests.
 *
 * **Pourquoi ce fichier existe.** `lireSession` attrapait toute erreur de
 * `verifySessionCookie` et rendait `null`, c'est-à-dire « personne n'est
 * connecté ». Une panne d'infrastructure — module introuvable, clé de service
 * refusée, réseau coupé — prenait donc l'apparence exacte d'un cookie expiré :
 * l'écran de connexion s'affichait, l'application semblait fonctionner, et
 * rien dans les journaux ne disait qu'un composant était cassé. C'est ce qui a
 * fait perdre du temps sur le 500 de Vercel, où la vraie erreur était avalée
 * ici avant d'atteindre le moindre journal.
 *
 * **La règle.** Seuls les codes ci-dessous veulent dire « cet identifiant ne
 * vaut rien » — l'utilisateur doit se reconnecter, et c'est un état normal.
 * Tout le reste est une panne : elle remonte, elle se voit, elle se répare.
 *
 * Les codes proviennent du SDK Admin lui-même (`firebase-admin/lib/utils`),
 * pas d'une liste recopiée d'une documentation qui peut vieillir.
 */

const IDENTIFIANT_SANS_VALEUR = new Set([
  // Cookie de session
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/invalid-session-cookie',
  // Jeton d'identité
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  // Forme du jeton, ou compte qui n'a plus le droit d'entrer
  'auth/argument-error',
  'auth/user-disabled',
  'auth/user-not-found',
]);

/**
 * Vrai quand l'erreur signifie « cet identifiant n'est pas valide », faux pour
 * tout le reste — y compris `auth/internal-error` et `auth/invalid-credential`,
 * qui désignent une défaillance du service ou de notre configuration, jamais
 * une faute de l'utilisateur.
 */
export function estIdentifiantSansValeur(erreur: unknown): boolean {
  const code = (erreur as { code?: unknown })?.code;
  return typeof code === 'string' && IDENTIFIANT_SANS_VALEUR.has(code);
}

/** Panne côté serveur, distincte d'une session absente. */
export class ErreurVerificationIdentite extends Error {
  constructor(readonly cause: unknown) {
    super(
      "La vérification de votre identité n'a pas abouti. Ce n'est pas votre " +
        'session qui est en cause : un composant du serveur est indisponible.',
    );
    this.name = 'ErreurVerificationIdentite';
  }
}
