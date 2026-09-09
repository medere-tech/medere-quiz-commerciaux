import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { authAdmin, firestoreAdmin } from '@/lib/firebase/admin';
import { envServeur } from '@/lib/env/serveur';
import { estDuDomaine } from '@/lib/auth/domaine';
import { estIdentifiantSansValeur } from '@/lib/auth/identifiant-invalide';
import { DUREE_SESSION_MS, NOM_COOKIE_SESSION } from '@/lib/auth/session-serveur';

// Le SDK Admin exige l'exécution Node.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CorpsAttendu = { idToken?: unknown };

/**
 * Ouvre la session à partir d'un jeton d'identité Google.
 *
 * C'est ici, côté serveur, qu'est vérifiée la restriction de domaine : le
 * paramètre `hd` de l'écran Google est un confort, pas une protection.
 */
export async function POST(requete: Request): Promise<NextResponse> {
  let corps: CorpsAttendu;
  try {
    corps = (await requete.json()) as CorpsAttendu;
  } catch {
    return NextResponse.json(
      { erreur: 'Requête illisible. Reconnectez-vous depuis la page de connexion.' },
      { status: 400 },
    );
  }

  const idToken = corps.idToken;
  if (typeof idToken !== 'string' || idToken.length === 0) {
    return NextResponse.json(
      { erreur: "Jeton d'identité manquant. Reconnectez-vous depuis la page de connexion." },
      { status: 400 },
    );
  }

  const auth = authAdmin();

  let jeton;
  try {
    jeton = await auth.verifyIdToken(idToken, true);
  } catch (probleme) {
    // Même distinction qu'à la lecture de session : un jeton sans valeur est
    // un 401 dont l'utilisateur peut faire quelque chose, une panne est un 503
    // dont il ne peut rien faire. Les confondre l'enverrait se reconnecter
    // indéfiniment devant un serveur cassé.
    if (estIdentifiantSansValeur(probleme)) {
      return NextResponse.json(
        { erreur: 'Votre connexion Google n\'a pas pu être vérifiée. Réessayez.' },
        { status: 401 },
      );
    }

    console.error("Vérification du jeton d'identité impossible", probleme);
    return NextResponse.json(
      {
        erreur:
          "La vérification de votre identité n'a pas abouti. Ce n'est pas votre " +
          'compte qui est en cause : signalez-le à l’équipe technique.',
      },
      { status: 503 },
    );
  }

  const email = typeof jeton.email === 'string' ? jeton.email.toLowerCase() : undefined;

  if (jeton.email_verified !== true || !estDuDomaine(email, envServeur.domaineAutorise)) {
    // Le compte existe désormais côté Firebase : on lui retire toute validité.
    // Les règles Firestore refusent de toute façon les adresses hors domaine.
    await auth.revokeRefreshTokens(jeton.uid);
    return NextResponse.json(
      {
        erreur:
          `Cette application est réservée aux adresses @${envServeur.domaineAutorise}. ` +
          `Connectez-vous avec votre adresse professionnelle Médéré.`,
      },
      { status: 403 },
    );
  }

  const adresse = email as string;
  const doitEtreAdmin = envServeur.adressesAdministrateurs.includes(adresse);

  // Le custom claim n'apparaît dans le jeton qu'à son renouvellement. Si le
  // jeton présenté ne porte pas encore la bonne valeur, on la pose et on
  // demande au navigateur un jeton frais : sans cela, le cookie de session
  // serait scellé avec un rôle périmé, pour cinq jours.
  if ((jeton.admin === true) !== doitEtreAdmin) {
    await auth.setCustomUserClaims(jeton.uid, doitEtreAdmin ? { admin: true } : {});
    return NextResponse.json(
      { rafraichirJeton: true, erreur: 'Vos droits ont changé, jeton à renouveler.' },
      { status: 409 },
    );
  }

  const documentUtilisateur = firestoreAdmin().collection('users').doc(jeton.uid);
  const existant = await documentUtilisateur.get();

  const champsCommuns = {
    email: adresse,
    nom: typeof jeton.name === 'string' ? jeton.name : adresse,
    photoURL: typeof jeton.picture === 'string' ? jeton.picture : '',
    // Affichage seulement. L'autorisation passe exclusivement par le claim.
    role: doitEtreAdmin ? 'admin' : 'commercial',
    vuLe: FieldValue.serverTimestamp(),
  };

  if (existant.exists) {
    await documentUtilisateur.update(champsCommuns);
  } else {
    await documentUtilisateur.set({
      ...champsCommuns,
      etoiles: 0,
      seriesTerminees: 0,
      creeLe: FieldValue.serverTimestamp(),
    });
  }

  const cookieSession = await auth.createSessionCookie(idToken, {
    expiresIn: DUREE_SESSION_MS,
  });

  const reponse = NextResponse.json({ uid: jeton.uid, email: adresse, admin: doitEtreAdmin });

  reponse.cookies.set({
    name: NOM_COOKIE_SESSION,
    value: cookieSession,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DUREE_SESSION_MS / 1000,
  });

  return reponse;
}

/** Ferme la session et invalide les jetons de rafraîchissement. */
export async function DELETE(requete: Request): Promise<NextResponse> {
  const cookie = requete.headers
    .get('cookie')
    ?.split(';')
    .map((morceau) => morceau.trim())
    .find((morceau) => morceau.startsWith(`${NOM_COOKIE_SESSION}=`))
    ?.slice(NOM_COOKIE_SESSION.length + 1);

  if (cookie) {
    try {
      const jeton = await authAdmin().verifySessionCookie(cookie, false);
      await authAdmin().revokeRefreshTokens(jeton.sub);
    } catch {
      // Cookie déjà invalide : la déconnexion reste un succès.
    }
  }

  const reponse = NextResponse.json({ deconnecte: true });
  reponse.cookies.set({
    name: NOM_COOKIE_SESSION,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return reponse;
}
