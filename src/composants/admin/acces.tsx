'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState, type ReactNode } from 'react';

import { Bouton, Carte } from '@/composants/ds/primitives';
import { EtatErreur, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { authentification } from '@/lib/firebase/client';
import {
  ErreurConnexion,
  renouvelerSessionServeur,
  seConnecter,
} from '@/lib/auth/connexion-client';

/**
 * Porte d'entrée du back-office.
 *
 * L'écran de connexion en propre — 00 · Connexion — appartient au lot 5 et
 * n'est pas construit ici. Ce composant est le comportement minimal qui
 * permet à Noémie d'entrer : la même authentification Google, restreinte au
 * domaine et vérifiée côté serveur, sans inventer l'écran.
 */

export function ConnexionAdmin({ motif }: { motif: 'anonyme' | 'sans-droits' }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string>();

  async function connecter() {
    setEnCours(true);
    setErreur(undefined);
    try {
      await seConnecter();
      window.location.reload();
    } catch (probleme) {
      setErreur(
        probleme instanceof ErreurConnexion
          ? probleme.message
          : "La connexion n'a pas abouti. Réessayez dans un instant.",
      );
      setEnCours(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-10)',
      }}
    >
      <Carte rayon="var(--radius-xl)" rembourrage="32px 34px" style={{ width: 460 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: 'var(--surface-page)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icone nom="layers" taille={22} couleur="var(--neutral-70)" />
        </span>
        <h1
          style={{
            margin: '18px 0 0',
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 26,
            lineHeight: 1.18,
            color: 'var(--text-heading)',
          }}
        >
          {motif === 'anonyme' ? 'Back-office pédagogique' : 'Cet espace ne vous est pas ouvert'}
        </h1>
        <p
          style={{
            margin: '10px 0 22px',
            fontSize: 'var(--body-md-size)',
            lineHeight: 1.55,
            color: 'var(--neutral-70)',
            textWrap: 'pretty',
          }}
        >
          {motif === 'anonyme'
            ? 'Connectez-vous avec votre adresse professionnelle Médéré pour écrire et publier des questions.'
            : "Votre compte n'a pas le rôle administrateur. Si vous venez de l'obtenir, déconnectez-vous et reconnectez-vous : le rôle n'arrive dans la session qu'au renouvellement du jeton."}
        </p>

        {erreur && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <EtatErreur titre="Connexion refusée" texte={erreur} />
          </div>
        )}

        {motif === 'anonyme' && (
          <Bouton taille="lg" pleineLargeur onClick={() => void connecter()} disabled={enCours}>
            {enCours ? 'Connexion en cours…' : 'Se connecter avec Google'}
          </Bouton>
        )}
      </Carte>
    </div>
  );
}

/**
 * Le serveur a validé le cookie de session ; encore faut-il que le SDK du
 * navigateur soit connecté, sans quoi toute lecture Firestore serait refusée
 * par les règles. Les deux peuvent diverger : cookie encore valide, session
 * navigateur effacée.
 */
/**
 * Le délai avant d'avouer qu'on attend.
 *
 * Une session déjà en cache revient en quelques dizaines de millisecondes.
 * Afficher un écran de chargement dans cet intervalle le fait paraître puis
 * disparaître aussitôt : le clignotement se remarque plus que l'attente qu'il
 * prétend couvrir. Passé ce seuil, l'attente est réelle et mérite d'être
 * montrée.
 */
const SEUIL_AVANT_ATTENTE_MS = 400;

export function GardeNavigateur({
  children,
  /**
   * Le serveur a constaté que le cookie a passé la moitié de sa vie.
   *
   * **Il arrive avec la page, il ne se demande pas.** Les dispositions lisent
   * déjà la session pour décider quoi rendre : le drapeau voyage avec ce
   * qu'elles rendent, et le cas courant — un cookie récent — ne coûte aucune
   * requête supplémentaire.
   */
  renouveler = false,
  /**
   * **Rendre les enfants tout de suite, sur la foi du cookie déjà vérifié.**
   *
   * Ce drapeau n'est pas une optimisation de confort : il répare une inversion.
   * La garde n'est montée que lorsque la disposition a lu la session côté
   * serveur — sans cookie valide, c'est `Connexion` qui est rendu, et on
   * n'arrive jamais ici. Attendre en plus le SDK du navigateur, c'est
   * redemander au client une réponse que le serveur a déjà donnée, et la payer
   * au prix du chargement d'un SDK.
   *
   * Le coût était mesuré, sur `/a-revoir`, build de production, cache vide :
   * le HTML servi porte les données privées (uid et `etoiles` à l'octet 29 469)
   * et le squelette d'attente, mais **aucun texte rendu de l'écran**. La preuve
   * que la garde en était la cause tient à deux exécutions au HTML identique :
   * avec session navigateur, le contenu paraît à 6 546 ms ; sans, l'écran
   * affiche « Votre session a expiré » et ne peint jamais un contenu pourtant
   * reçu. Ce n'est pas une déduction, c'est une différence.
   *
   * **Il ne se pose que là où l'écran est semé par le serveur** — `(parcours)`
   * et `serie`. Les écrans du back-office lisent encore `currentUser` dans
   * leurs gestionnaires, avec un `if (!utilisateur) return;` qui avale le clic
   * en silence : les rendre trop tôt exposerait ce défaut au lieu de le
   * corriger. Ils gardent l'attente jusqu'à ce qu'ils soient semés à leur tour.
   */
  surLaFoiDuCookie = false,
}: {
  children: ReactNode;
  renouveler?: boolean;
  surLaFoiDuCookie?: boolean;
}) {
  const [utilisateur, setUtilisateur] = useState<User | null | undefined>(undefined);
  const [attenteVisible, setAttenteVisible] = useState(false);

  useEffect(() => onAuthStateChanged(authentification(), setUtilisateur), []);

  /*
   * Le renouvellement glissant : une fois par montage, et seulement quand le
   * serveur l'a demandé.
   *
   * Il attend d'avoir l'utilisateur Firebase — c'est lui qui produit le jeton
   * d'identité frais. Rien ne s'affiche, rien ne bloque : le cookie en place
   * est encore valable, on le refait avec de l'avance.
   */
  useEffect(() => {
    if (!renouveler || !utilisateur) return;
    void renouvelerSessionServeur(utilisateur);
  }, [renouveler, utilisateur]);

  useEffect(() => {
    if (utilisateur !== undefined) return;
    const minuterie = window.setTimeout(() => setAttenteVisible(true), SEUIL_AVANT_ATTENTE_MS);
    return () => window.clearTimeout(minuterie);
  }, [utilisateur]);

  /*
   * **Le mode « sur la foi du cookie » : on rend, puis on corrige.**
   *
   * Tant que le SDK n'a pas répondu, il n'y a rien à attendre : le serveur a
   * vérifié le cookie et a déjà semé l'écran. Quand il répond « personne »,
   * l'écran ne bascule pas sous les doigts — le contenu reste, et un bandeau
   * dit ce qui s'est passé et ce qu'il faut faire. Ce que la page montre est
   * juste : ces données sont bien celles du porteur du cookie. Ce qui ne
   * marchera pas, ce sont les écritures, et c'est exactement ce que le bandeau
   * annonce.
   */
  if (surLaFoiDuCookie) {
    return (
      <>
        {utilisateur === null && <CorrectionSessionNavigateur />}
        {children}
      </>
    );
  }

  // Vérifier une session n'est pas un incident : c'est un chargement, et il se
  // montre comme tous les autres écrans de chargement du système — des
  // squelettes, sans phrase. Le mot « Firebase » ne disait rien à personne.
  if (utilisateur === undefined) {
    return attenteVisible ? (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
        <Squelettes lignes={5} />
      </div>
    ) : null;
  }

  if (utilisateur === null) {
    return (
      <div style={{ padding: 'clamp(20px, 3.2vw, 36px) clamp(16px, 3.2vw, 40px)' }}>
        <EtatErreur
          titre="Votre session a expiré dans ce navigateur"
          texte="Vos questions sont enregistrées. Reconnectez-vous pour reprendre la main sur la banque."
          action={
            <Bouton
              variante="secondaire"
              onClick={() => {
                void seConnecter().then(() => window.location.reload());
              }}
            >
              Se reconnecter
            </Bouton>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * La correction, quand le SDK finit par répondre « personne ».
 *
 * Le cas est rare et réel : le cookie de session tient quatorze jours, la
 * session du navigateur peut avoir été effacée entre-temps — navigation
 * privée fermée, données de site nettoyées, déconnexion depuis un autre
 * onglet. Le serveur a raison d'afficher la page ; le navigateur a raison de
 * dire qu'il ne pourra rien écrire.
 *
 * **C'est une correction, pas une bascule.** Elle s'ajoute au-dessus d'un
 * écran déjà lu, elle ne le remplace pas : un commercial en train de lire sa
 * progression ne doit pas la voir disparaître parce qu'un SDK a fini de
 * charger. Et elle dit la conséquence exacte — ce qui est affiché est juste,
 * ce qui sera tenté ne partira pas — plutôt que de s'excuser.
 */
function CorrectionSessionNavigateur() {
  return (
    <div
      className="correction-session"
      role="status"
      style={{ padding: 'clamp(16px, 3.2vw, 24px) clamp(16px, 3.2vw, 40px) 0' }}
    >
      <Carte rayon="var(--radius-lg)" rembourrage="18px 22px" elevation="petite">
        <div className="correction-session-ligne">
          <span className="correction-session-picto">
            <Icone nom="refresh" taille={20} couleur="var(--neutral-70)" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontSize: 'var(--body-md-size)',
                fontWeight: 600,
                color: 'var(--text-heading)',
                textWrap: 'pretty',
              }}
            >
              Votre session a expiré dans ce navigateur
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 4,
                fontSize: 'var(--body-sm-size)',
                lineHeight: 1.5,
                color: 'var(--neutral-70)',
                textWrap: 'pretty',
              }}
            >
              Ce que vous lisez est à jour. En revanche, rien de ce que vous ferez ne sera
              enregistré tant que vous ne vous serez pas reconnecté.
            </span>
          </span>
          <Bouton
            variante="secondaire"
            onClick={() => {
              void seConnecter().then(() => window.location.reload());
            }}
          >
            Se reconnecter
          </Bouton>
        </div>
      </Carte>
    </div>
  );
}
