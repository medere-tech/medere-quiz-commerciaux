'use client';

import { useState } from 'react';

import { Bouton, Carte } from '@/composants/ds/primitives';
import { EtatErreur } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { ErreurConnexion, seConnecter } from '@/lib/auth/connexion-client';
import { DOMAINE_DES_REGLES } from '@/lib/auth/domaine';

/**
 * 00 · Connexion.
 *
 * **Écart assumé avec la maquette.** Elle montre une saisie adresse et mot de
 * passe. Le projet n'a pas de mots de passe : l'authentification passe par
 * Google, restreinte au domaine, et le rôle est un custom claim vérifié côté
 * serveur. Un formulaire de mot de passe supposerait un magasin
 * d'identifiants que rien n'alimente, et une surface d'attaque que rien ne
 * justifie. On garde donc le bouton Google, et le reste de la maquette —
 * carte centrée, ton, hiérarchie.
 */
export function Connexion({ motif }: { motif: 'anonyme' | 'domaine' }) {
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
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 5vw, 40px)',
      }}
    >
      <Carte rayon="var(--radius-xl)" rembourrage="clamp(26px, 5vw, 34px)" style={{ width: 460, maxWidth: '100%' }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: 'var(--brand-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ display: 'flex', gap: 3 }}>
            <span style={{ width: 3, height: 15, borderRadius: 2, background: '#fff' }} />
            <span style={{ width: 3, height: 15, borderRadius: 2, background: '#fff' }} />
          </span>
        </span>

        <h1
          style={{
            margin: '20px 0 0',
            fontFamily: 'var(--font-sans)',
            fontWeight: 300,
            fontSize: 'clamp(24px, 5vw, 30px)',
            lineHeight: 1.18,
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          {motif === 'anonyme' ? (
            <>
              Le catalogue Médéré,{' '}
              <em
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontWeight: 400,
                }}
              >
                dix questions à la fois
              </em>
              .
            </>
          ) : (
            'Cette adresse n’ouvre pas l’entraînement'
          )}
        </h1>

        <p
          style={{
            margin: '12px 0 24px',
            fontSize: 'var(--body-md-size)',
            lineHeight: 1.55,
            color: 'var(--neutral-70)',
            textWrap: 'pretty',
          }}
        >
          {motif === 'anonyme'
            ? `Connectez-vous avec votre adresse professionnelle @${DOMAINE_DES_REGLES}. Six minutes suffisent pour une série.`
            : `L’entraînement est réservé aux adresses @${DOMAINE_DES_REGLES}. Reconnectez-vous avec votre compte professionnel.`}
        </p>

        {erreur && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <EtatErreur titre="Connexion refusée" texte={erreur} />
          </div>
        )}

        <Bouton
          taille="lg"
          pleineLargeur
          disabled={enCours}
          iconeGauche={<Icone nom="users" taille={16} />}
          onClick={() => void connecter()}
        >
          {enCours ? 'Connexion en cours…' : 'Se connecter avec Google'}
        </Bouton>
      </Carte>
    </main>
  );
}
