'use client';

import { useMemo } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { Bouton, Carte, Meta, TitreSection } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { FormeFormation, Jauge } from '@/composants/ds/parcours';
import { useDonneesParcours } from '@/composants/parcours/donnees';
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
 * **Ce que la maquette montre et qui n'est pas construit ici :** la carte
 * « Session collective » (lot 7), le bandeau « Objectif du jour » avec sa
 * série de jours d'affilée, et le panneau « Récompenses ». Les deux derniers
 * relèvent d'écrans en attente au tri des maquettes, et aucun ne peut être
 * calculé : le modèle ne garde ni historique quotidien ni récompenses.
 */
const ROUTE_SERIE: Route = '/serie';
const ROUTE_A_REVOIR: Route = '/a-revoir';

export function Accueil({ prenom }: { prenom: string }) {
  const routeur = useRouter();
  const chargement = useDonneesParcours();

  const calculs = useMemo(() => {
    if (chargement.etat !== 'pret') return null;
    const { questions, formations, etats } = chargement.donnees;

    return {
      globale: maitrise(etats),
      ratees: etats.filter((etat) => etat.derniereRatee).length,
      avancements: avancementParFormation(formations, questions, etats),
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
  const { globale, ratees, avancements } = calculs!;
  const disponibles = questions.length;

  return (
    <div className="page-admin">
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

        <div
          style={{
            marginTop: 'var(--space-6)',
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <Bouton
            taille="lg"
            disabled={disponibles === 0}
            iconeGauche={<Icone nom="play" taille={16} />}
            onClick={() => routeur.push(ROUTE_SERIE)}
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
            onClick={() => routeur.push(ROUTE_A_REVOIR)}
          >
            {ratees > 0 ? `Revoir mes ${ratees} questions ratées` : 'Aucune question à revoir'}
          </Bouton>
        </div>
      </div>

      {disponibles === 0 ? (
        <EtatVide
          icone="layers"
          titre="Aucune question publiée pour l’instant"
          texte="L’entraînement s’ouvrira dès que des questions seront publiées. Rien à faire de votre côté."
        />
      ) : (
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
                  className="ligne-tableau"
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
                  <span className="colonne-fixe" style={{ flex: 'none', width: 132 }}>
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
                  <span className="colonne-fixe" style={{ flex: 'none', width: 104, textAlign: 'right' }}>
                    <Meta style={{ fontSize: 12 }}>
                      {part.total} question{part.total > 1 ? 's' : ''}
                    </Meta>
                  </span>
                </Carte>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
