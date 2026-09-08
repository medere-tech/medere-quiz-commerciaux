'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState, type ReactNode } from 'react';

import { Bouton, Carte } from '@/composants/ds/primitives';
import { EtatErreur, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { authentification } from '@/lib/firebase/client';
import { ErreurConnexion, seConnecter } from '@/lib/auth/connexion-client';

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

export function GardeNavigateur({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<User | null | undefined>(undefined);
  const [attenteVisible, setAttenteVisible] = useState(false);

  useEffect(() => onAuthStateChanged(authentification(), setUtilisateur), []);

  useEffect(() => {
    if (utilisateur !== undefined) return;
    const minuterie = window.setTimeout(() => setAttenteVisible(true), SEUIL_AVANT_ATTENTE_MS);
    return () => window.clearTimeout(minuterie);
  }, [utilisateur]);

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
