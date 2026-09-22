'use client';

import { useMemo } from 'react';
import type { Route } from 'next';

import { Bouton, Carte, Meta, TitreSection } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { FormeFormation, Jauge } from '@/composants/ds/parcours';
import {
  useDonneesParcours,
  type ParcoursSeme,
  type Referentiel,
} from '@/composants/parcours/donnees';
import { BandeauSeance } from '@/composants/session/BandeauSeance';
import { ObjectifDuJour } from '@/composants/parcours/ObjectifDuJour';
import { MesRecompenses } from '@/composants/parcours/MesRecompenses';
import { mesurerCatalogue } from '@/lib/serie/recompenses';
import { MesPrix } from '@/composants/session/MesPrix';
import { identiteVisuelle } from '@/lib/formations/depot';
import { avancementParFormation, maitrise } from '@/lib/serie/maitrise';
import { libelleSeuilsEtoiles } from '@/lib/serie/verdict';
import { LIBELLE_PONDERATION, TAILLE_SERIE } from '@/lib/serie/tirage';

/**
 * 01 · Accueil.
 *
 * Deux gestes, et rien d'autre à décider : lancer une série, ou reprendre ce
 * qu'on a raté. Le reste — maîtrise, étoiles, avancement — répond à la seule
 * question que le commercial se pose en ouvrant : où j'en suis.
 *
 * **Ce que la maquette montre et qui n'est pas encore construit ici :** le
 * panneau « Récompenses » de la colonne de droite. Le reste y est — la carte
 * de séance à droite du titre, l'objectif du jour et la régularité.
 */
const ROUTE_SERIE: Route = '/serie';
const ROUTE_A_REVOIR: Route = '/a-revoir';

export function Accueil({
  prenom,
  referentiel,
  parcours,
}: {
  prenom: string;
  referentiel: Referentiel;
  /** Semé par le serveur : l'écran s'affiche rempli, sans lecture cliente. */
  parcours?: ParcoursSeme;
}) {
  const chargement = useDonneesParcours(referentiel, parcours);

  const calculs = useMemo(() => {
    if (chargement.etat !== 'pret') return null;
    const { questions, formations, etats } = chargement.donnees;

    const avancements = avancementParFormation(formations, questions, etats);
    const scenarios = new Set(
      questions.filter((question) => question.type === 'scenario').map((question) => question.id),
    );

    return {
      globale: maitrise(etats),
      ratees: etats.filter((etat) => etat.derniereRatee).length,
      avancements,
      mesures: {
        ...mesurerCatalogue(
          avancements,
          etats.filter((etat) => scenarios.has(etat.id)),
        ),
        recordJours: chargement.donnees.progression.assiduite.record,
        joursActifsCetteSemaine: chargement.donnees.progression.assiduite.semaine.length,
      },
    };
  }, [chargement]);

  if (chargement.etat === 'chargement' || chargement.etat === 'anonyme') {
    return (
      <div className="page-admin">
        <Squelettes lignes={5} />
      </div>
    );
  }

  if (chargement.etat === 'erreur') {
    return (
      <div className="page-admin">
        <EtatErreur
          titre="Entraînement indisponible"
          texte={chargement.echec.texte}
          action={
            chargement.echec.reessayable ? (
              <Bouton
                variante="secondaire"
                iconeGauche={<Icone nom="refresh" taille={16} />}
                onClick={() => window.location.reload()}
              >
                Réessayer
              </Bouton>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { progression, questions } = chargement.donnees;
  const { globale, ratees, avancements, mesures } = calculs!;
  const disponibles = questions.length;

  /*
   * Les deux gestes de l'écran, écrits une fois. Ils s'affichent sous le titre
   * au bureau et dans le pied fixe sur téléphone — deux emplacements, jamais
   * deux libellés.
   */
  const actions = (
    <>
      <Bouton
        taille="lg"
        disabled={disponibles === 0}
        iconeGauche={<Icone nom="play" taille={16} />}
        href={ROUTE_SERIE}
      >
        {disponibles >= TAILLE_SERIE
          ? `Lancer une série de ${TAILLE_SERIE}`
          : `Lancer une série de ${disponibles}`}
      </Bouton>
      <Bouton
        taille="lg"
        variante="secondaire"
        disabled={ratees === 0}
        iconeGauche={<Icone nom="refresh" taille={16} />}
        href={ROUTE_A_REVOIR}
      >
        {ratees === 0
          ? 'Aucune question à revoir'
          : ratees === 1
            ? 'Revoir ma question ratée'
            : `Revoir mes ${ratees} questions ratées`}
      </Bouton>
    </>
  );

  return (
    <div className="page-admin">
      {/*
       * La maquette pose le titre et la carte de séance sur une même ligne :
       * le bloc de texte à gauche, une colonne de 232 px à droite. Le jeudi,
       * la séance est la première chose à voir — et elle ne doit pas coûter un
       * défilement. Sous 900 px, la carte passe sous le texte.
       */}
      <div className="accueil-entete">
      <div style={{ maxWidth: 660 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontWeight: 300,
            fontSize: 'clamp(26px, 5vw, 38px)',
            lineHeight: 1.15,
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          Bonjour {prenom}, vous maîtrisez{' '}
          <em style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400 }}>
            {globale.pourcentage} % du catalogue de questions
          </em>
          .
        </h1>

        <div style={{ marginTop: 'var(--space-5)', maxWidth: 420 }}>
          <Jauge valeur={globale.pourcentage} />
        </div>

        <p
          style={{
            margin: '14px 0 0',
            fontSize: 'var(--body-md-size)',
            color: 'var(--text-secondary)',
            textWrap: 'pretty',
          }}
        >
          {/* « Acquise » se définit ici, une fois, sur le premier écran : c'est la
              dernière réponse qui compte, pas le cumul des réussites. Et une
              question ratée deux fois attend une nouvelle tentative, pas une
              seconde. */}
          {globale.maitrisees} question{globale.maitrisees > 1 ? 's' : ''} sur {globale.total}{' '}
          {globale.maitrisees > 1 ? 'acquises' : 'acquise'}
          {globale.maitrisees > 1
            ? ' : vos dernières réponses y étaient justes.'
            : ' : votre dernière réponse y était juste.'}{' '}
          {ratees > 0
            ? `${ratees} attend${ratees > 1 ? 'ent' : ''} une nouvelle tentative.`
            : 'Aucune question en attente de rattrapage.'}
        </p>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 'var(--space-4)',
            padding: '8px 14px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--surface-card)',
            boxShadow: 'var(--shadow-card-sm)',
          }}
        >
          <Icone nom="award" taille={17} couleur="var(--accent-highlight)" />
          <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--text-body)' }}>
            <strong style={{ fontWeight: 'var(--weight-semibold)' }}>{progression.etoiles}</strong>{' '}
            étoile{progression.etoiles > 1 ? 's' : ''}
          </span>
          <Meta style={{ fontSize: 12 }}>
            {progression.seriesTerminees} série{progression.seriesTerminees > 1 ? 's' : ''}{' '}
            terminée{progression.seriesTerminees > 1 ? 's' : ''}
          </Meta>
        </span>

        {/* Les étoiles s'affichaient sans qu'on sache comment on les gagne, et
            le tirage sans qu'on sache pourquoi une question revient. Les deux
            règles se disent en une ligne chacune. */}
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 'var(--body-sm-size)',
            lineHeight: 1.55,
            color: 'var(--neutral-70)',
            maxWidth: 520,
            textWrap: 'pretty',
          }}
        >
          {libelleSeuilsEtoiles()} {LIBELLE_PONDERATION}
        </p>

        {/* Sur téléphone, ces deux boutons descendent dans le pied fixe : la
            maquette les y place, et l'accueil fait deux mille pixels de haut
            à 375. `action-doublee` les masque ici, pas ailleurs. */}
        <div
          className="action-doublee"
          style={{
            marginTop: 'var(--space-6)',
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          {actions}
        </div>
      </div>

        <div className="accueil-seance">
          <BandeauSeance />
        </div>
      </div>

      {/*
       * L'objectif du jour et la régularité.
       *
       * Posé juste sous le titre, comme la maquette : c'est la première chose
       * qu'on lit après avoir su où l'on en est, et la seule qui donne une
       * raison de revenir demain.
       */}
      <ObjectifDuJour assiduite={progression.assiduite} />

      {/*
       * Les prix des séances collectives, à côté des étoiles.
       *
       * Les étoiles disent l'assiduité, les prix disent les jeudis. Le bloc
       * n'apparaît qu'à partir de la première séance jouée : un cadre vide
       * intitulé « Vos prix » ne promet rien à personne.
       */}
      <MesPrix uid={chargement.donnees.uid} />

      {disponibles === 0 ? (
        <EtatVide
          icone="layers"
          titre="Aucune question publiée pour l’instant"
          texte="L’entraînement s’ouvrira dès que des questions seront publiées. Rien à faire de votre côté."
        />
      ) : (
        <div className="accueil-colonnes">
          <div>
          <TitreSection
            indice={`${avancements.length} formation${avancements.length > 1 ? 's' : ''} ${avancements.length > 1 ? 'ont' : 'a'} au moins une question`}
          >
            Avancement par formation
          </TitreSection>

          <div
            style={{
              marginTop: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {avancements.map(({ formation, maitrise: part }) => {
              const identite = identiteVisuelle(formation);
              return (
                <Carte
                  key={formation.id}
                  rayon="var(--radius-lg)"
                  rembourrage="16px 20px"
                  elevation="petite"
                  className="ligne-tableau ligne-formation"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}
                >
                  <span className="colonne-fixe" style={{ flex: 'none' }}>
                    <FormeFormation fichier={identite.fichier} taille={30} />
                  </span>
                  <span className="colonne-souple" style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--body-md-size)',
                        fontWeight: 'var(--weight-semibold)',
                        color: 'var(--text-heading)',
                        textWrap: 'pretty',
                      }}
                    >
                      {formation.nom}
                    </span>
                    <Meta style={{ fontSize: 12 }}>
                      {formation.cibles.join(', ') || 'Public non précisé'}
                    </Meta>
                  </span>
                  <span className="colonne-fixe colonne-jauge" style={{ flex: 'none', width: 132 }}>
                    <Jauge valeur={part.pourcentage} ton={identite.couleur} hauteur={5} />
                  </span>
                  <span
                    className="colonne-fixe"
                    style={{
                      flex: 'none',
                      width: 46,
                      textAlign: 'right',
                      fontSize: 'var(--body-md-size)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--text-heading)',
                    }}
                  >
                    {part.pourcentage} %
                  </span>
                  <span
                    className="colonne-fixe colonne-compte"
                    style={{ flex: 'none', width: 104, textAlign: 'right' }}
                  >
                    <Meta style={{ fontSize: 12 }}>
                      {part.total} question{part.total > 1 ? 's' : ''}
                    </Meta>
                  </span>
                </Carte>
              );
            })}
          </div>
          </div>

          {/*
            * Les récompenses, dans la colonne de droite — la place que la
            * maquette leur donne. Elles sont loin des prix, qui restent en
            * pleine largeur plus haut : deux blocs de médaillons teintés côte à
            * côte se confondraient, quelle que soit la légende.
            */}
          <MesRecompenses carte={chargement.donnees.progression.recompenses} mesures={mesures} />
        </div>
      )}

      {/* Le pied fixe du téléphone. Il ne rend que sous 700 px — la feuille de
          style s'en charge — et porte exactement les deux mêmes gestes. */}
      <div className="pied-mobile">{actions}</div>
    </div>
  );
}
