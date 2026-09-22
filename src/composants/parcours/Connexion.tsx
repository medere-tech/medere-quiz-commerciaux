'use client';

import { useState } from 'react';

import { Bouton, Carte } from '@/composants/ds/primitives';
import { EtatErreur } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { Marque } from '@/composants/ds/Coquille';
import { Collage } from '@/composants/session/Collage';
import { ErreurConnexion, seConnecter } from '@/lib/auth/connexion-client';
import { DOMAINE_DES_REGLES } from '@/lib/auth/domaine';
import { TAILLE_SERIE } from '@/lib/serie/tirage';

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
    <main className="connexion">
      {/*
       * Le panneau de marque, à gauche.
       *
       * **C'est la moitié de l'écran que la maquette dessine**, et elle ne
       * décore pas : c'est le seul endroit du produit qui dit à quoi sert
       * l'outil avant qu'on y entre. Il disparaît sous 900 px — la maquette
       * mobile ne le dessine pas, et un panneau de marque au-dessus d'un
       * formulaire sur un téléphone repousse le formulaire sous la ligne de
       * flottaison.
       *
       * **Sur téléphone, il ne disparaît pas : il devient un bandeau haut.**
       * C'est ce que la maquette mobile livrée après coup demande — la
       * promesse et le collage restent, le formulaire prend le reste, et
       * l'action descend au pouce.
       */}
      <aside className="connexion-marque">
        {/* Deux collages, un par largeur : la maquette ne pose pas les mêmes
            formes aux mêmes endroits, et redimensionner celui du bureau au
            prorata en ferait une tache. */}
        <span className="connexion-collage-large">
          <Collage
            formes={[
              { fichier: 'forme-2-FECA45.svg', taille: 200, x: 430, y: -84, rotation: 16 },
              { fichier: 'forme-3-17BEBB.svg', taille: 240, x: 452, y: 96, rotation: -12 },
              { fichier: 'forme-5-D87DA9.svg', taille: 140, x: 486, y: 322, rotation: 30 },
            ]}
          />
        </span>
        <span className="connexion-collage-etroit">
          <Collage
            formes={[
              { fichier: 'forme-2-FECA45.svg', taille: 150, x: 330, y: -62, rotation: 16 },
              { fichier: 'forme-3-17BEBB.svg', taille: 170, x: 356, y: 128, rotation: -12 },
            ]}
          />
        </span>

        <span style={{ position: 'relative' }}>
          <Marque contexte="Quiz Médéré" taille={34} tailleLibelle="var(--body-md-size)" fond="encre" />
        </span>

        <div className="connexion-promesse-marque">
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontWeight: 300,
              fontSize: 'clamp(26px, 2.6vw, 34px)',
              lineHeight: 1.2,
              color: '#fff',
              textWrap: 'pretty',
            }}
          >
            Dix minutes par jour, et le catalogue{' '}
            <em style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400 }}>
              ne vous surprend plus
            </em>
            .
          </h2>
          <p
            style={{
              margin: '18px 0 0',
              fontSize: 'var(--body-md-size)',
              lineHeight: 1.6,
              color: 'rgba(255, 255, 255, 0.7)',
              textWrap: 'pretty',
            }}
          >
            {/* La maquette annonce « 214 questions ». Le nombre réel ne peut pas
                être lu ici : cet écran est le seul qui ne charge pas Firestore,
                et l'y remettre coûterait 166 ko au premier écran de chaque
                visite. Un nombre inventé serait pire qu'un nombre absent. */}
            Des questions écrites par la responsable pédagogique, sur les formations du
            catalogue et leurs modalités.
          </p>
        </div>
      </aside>

      <div className="connexion-accueil">
      <Carte
        className="connexion-carte"
        rayon="var(--radius-xl)"
        rembourrage="clamp(26px, 5vw, 34px)"
        style={{ width: 460, maxWidth: '100%' }}
      >
        <h1
          style={{
            margin: 0,
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

        {/*
          * Sur téléphone, cette ligne occupe le bas du corps et pousse l'action
          * sous le pouce — c'est la maquette mobile. Au bureau, elle n'existe
          * pas : l'écran y est large et la promesse est déjà dans le panneau.
          */}
        <p className="connexion-promesse">
          <Icone nom="clock" taille={17} couleur="var(--neutral-60)" />
          <span>
            Votre série du jour vous attend : {TAILLE_SERIE} questions, quelques minutes.
          </span>
        </p>

        <div className="connexion-action">
          <Bouton
            taille="lg"
            pleineLargeur
            disabled={enCours}
            iconeGauche={<Icone nom="users" taille={16} />}
            onClick={() => void connecter()}
          >
            {enCours ? 'Connexion en cours…' : 'Se connecter avec Google'}
          </Bouton>
        </div>
      </Carte>
      </div>
    </main>
  );
}
