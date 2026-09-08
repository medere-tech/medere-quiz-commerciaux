'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { Bouton, Carte, Meta, Onglets, TitrePage, TitreSection } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { FormeFormation, Jauge } from '@/composants/ds/parcours';
import { chargerFormations, identiteVisuelle, type Formation } from '@/lib/formations/depot';
import { chargerQuestionsParStatut, type Question } from '@/lib/questions/depot';
import { chargerStatistiques } from '@/lib/statistiques/depot';
import type { StatsQuestion } from '@/lib/statistiques/modele';
import {
  classer,
  parFormation,
  resumer,
  TENTATIVES_FIABLES,
  type LigneStat,
} from '@/lib/statistiques/analyse';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';
import { entierBorne, useParametresUrl } from '@/lib/navigation/parametres-url';
import { ChargerPlus } from '@/composants/admin/ChargerPlus';
import { LIBELLES_TYPE } from '@/lib/questions/modele';

/**
 * 09 · Statistiques.
 *
 * **À quoi sert cet écran.** À repérer les questions qui font trébucher
 * l'équipe. Une question massivement ratée signale le plus souvent un
 * argumentaire à clarifier, pas des commerciaux à former : le classement
 * pointe une fiche à reprendre, pas une personne à reprendre.
 *
 * **Ce que la maquette contient et qui n'est pas construit.** Un bloc
 * « Maîtrise par commercial », six noms et leurs pourcentages, renvoyant vers
 * l'écran 06b. Il est infaisable par construction, et c'est voulu :
 * `questionStats` ne porte aucun identifiant, et les règles refusent à
 * l'administrateur la lecture des réponses individuelles. Le bloc est inscrit
 * aux écrans en attente de `docs/design-imports.md`. À sa place, la fragilité
 * par formation — même question posée à l'échelle du catalogue, sans nom.
 *
 * Les onglets de période de la maquette ne sont pas construits non plus :
 * `questionStats` est un cumul depuis la mise en service, sans découpage dans
 * le temps. Proposer « 7 jours » afficherait le total en le datant faux.
 */

const PAR_PAGE = 20;

const DEFAUTS = { vue: 'ratees', vus: String(PAR_PAGE) };

type Chargement =
  | { etat: 'chargement' }
  | { etat: 'erreur'; echec: EchecDeLecture }
  | {
      etat: 'pret';
      questions: Question[];
      formations: Formation[];
      stats: StatsQuestion[];
    };

export default function PageStatistiques() {
  const routeur = useRouter();
  const [chargement, setChargement] = useState<Chargement>({ etat: 'chargement' });
  const { valeurs, definir } = useParametresUrl(DEFAUTS);

  const vue = valeurs.vue;
  const vus = entierBorne(valeurs.vus, PAR_PAGE, 1);

  useEffect(() => {
    let vivant = true;

    void (async () => {
      try {
        // Le filtre part dans la requête : l'écran ne parle que des questions
        // publiées, il n'a aucune raison de télécharger les brouillons. Sans
        // tri : le classement se fait sur le taux d'échec, calculé ici.
        const [publiees, formations, stats] = await Promise.all([
          chargerQuestionsParStatut('publiee'),
          chargerFormations(),
          chargerStatistiques(),
        ]);
        if (vivant) {
          setChargement({
            etat: 'pret',
            questions: publiees,
            formations,
            stats,
          });
        }
      } catch (erreur) {
        if (vivant) setChargement({ etat: 'erreur', echec: echecDeLecture(erreur, 'les statistiques agrégées') });
      }
    })();

    return () => {
      vivant = false;
    };
  }, []);

  const analyse = useMemo(() => {
    if (chargement.etat !== 'pret') return null;
    const { questions, formations, stats } = chargement;

    return {
      classement: classer(questions, stats, formations),
      fragilites: parFormation(questions, stats, formations),
      resume: resumer(questions, stats),
    };
  }, [chargement]);

  if (chargement.etat === 'chargement') {
    return (
      <div className="page-admin">
        <Squelettes lignes={6} />
      </div>
    );
  }

  if (chargement.etat === 'erreur') {
    return (
      <div className="page-admin">
        <EtatErreur titre="Statistiques indisponibles" texte={chargement.echec.texte} />
      </div>
    );
  }

  if (!analyse) return null;

  const { classement, fragilites, resume } = analyse;

  const listes: Record<string, LigneStat[]> = {
    ratees: classement.fiables,
    tropPeu: classement.tropPeu,
  };
  const courante = listes[vue] ?? classement.fiables;
  const jamais = classement.jamaisTentees;
  const total = vue === 'jamais' ? jamais.length : courante.length;
  const visibles = courante.slice(0, vus);

  return (
    <div className="page-admin">
      <TitrePage
        titre="Statistiques"
        sous={
          resume.reponses === 0
            ? 'Aucune réponse enregistrée pour l’instant. Les chiffres apparaîtront dès les premières séries.'
            : `${resume.reponses} réponse${resume.reponses > 1 ? 's' : ''} enregistrée${resume.reponses > 1 ? 's' : ''} depuis la mise en service, sur ${resume.questionsPubliees} question${resume.questionsPubliees > 1 ? 's' : ''} publiée${resume.questionsPubliees > 1 ? 's' : ''}. Aucun nom sur cet écran : les réponses sont agrégées sans identifiant.`
        }
      />

      <div className="grille-chiffres">
        <Chiffre libelle="Réponses enregistrées" valeur={String(resume.reponses)} note="depuis la mise en service" />
        <Chiffre
          libelle="Taux d’échec moyen"
          valeur={`${resume.tauxEchecMoyen} %`}
          note="toutes questions confondues"
          alerte={resume.tauxEchecMoyen > 50}
        />
        <Chiffre
          libelle="Questions publiées"
          valeur={String(resume.questionsPubliees)}
          note="dans le tirage des séries"
        />
        <Chiffre
          libelle="Jamais servies"
          valeur={String(resume.jamaisTentees)}
          note="publiées, encore jamais tirées"
        />
      </div>

      {resume.questionsPubliees === 0 ? (
        <EtatVide
          icone="layers"
          titre="Aucune question publiée"
          texte="Les statistiques se remplissent à mesure que les commerciaux répondent. Publiez des questions pour ouvrir l’entraînement."
          actions={
            <Bouton onClick={() => routeur.push('/admin/questions' as Route)}>
              Ouvrir la banque
            </Bouton>
          }
        />
      ) : (
        <div className="grille-deux-colonnes" style={{ gridTemplateColumns: 'minmax(0, 1fr) 316px' }}>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
              }}
            >
              <Onglets
                items={[
                  { valeur: 'ratees', libelle: 'Les plus ratées' },
                  { valeur: 'tropPeu', libelle: 'Trop peu de réponses' },
                  { valeur: 'jamais', libelle: 'Jamais servies' },
                ]}
                valeur={vue}
                onChange={(valeur) => definir({ vue: valeur, vus: String(PAR_PAGE) })}
              />
              <span style={{ marginLeft: 'auto' }}>
                <Meta>
                  {total} question{total > 1 ? 's' : ''}
                </Meta>
              </span>
            </div>

            <p
              style={{
                margin: '14px 0 0',
                fontSize: 'var(--body-sm-size)',
                lineHeight: 1.55,
                color: 'var(--neutral-70)',
                maxWidth: 640,
                textWrap: 'pretty',
              }}
            >
              {vue === 'ratees'
                ? `Classées par taux d’échec, à partir de ${TENTATIVES_FIABLES} réponses. Une question massivement ratée signale le plus souvent un argumentaire à clarifier.`
                : vue === 'tropPeu'
                  ? `Moins de ${TENTATIVES_FIABLES} réponses : un taux calculé ici ne voudrait rien dire, une seule erreur ferait cent pour cent.`
                  : 'Publiées, mais encore jamais tirées dans une série. Elles entreront d’elles-mêmes : le tirage sert en priorité ce qui n’a jamais été vu.'}
            </p>

            <div
              style={{
                marginTop: 'var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {vue === 'jamais'
                ? jamais
                    .slice(0, vus)
                    .map((question) => (
                      <LigneQuestion
                        key={question.id}
                        question={question}
                        formation={
                          chargement.formations.find(
                            (candidate) => candidate.id === question.formationIds[0],
                          ) ?? null
                        }
                        onOuvrir={() => routeur.push(`/admin/questions/${question.id}` as Route)}
                      />
                    ))
                : visibles.map((ligne) => (
                    <LigneQuestion
                      key={ligne.question.id}
                      question={ligne.question}
                      formation={ligne.formation}
                      ligne={ligne}
                      avecTaux={vue === 'ratees'}
                      onOuvrir={() =>
                        routeur.push(`/admin/questions/${ligne.question.id}` as Route)
                      }
                    />
                  ))}
            </div>

            {/* Une absence inexpliquée passe pour un oubli. On dit combien de
                questions sont écartées du classement, et pourquoi. */}
            {vue === 'ratees' && classement.tropPeu.length > 0 && (
              <p
                style={{
                  margin: 'var(--space-4) 0 0',
                  fontSize: 'var(--body-sm-size)',
                  lineHeight: 1.55,
                  color: 'var(--neutral-70)',
                  textWrap: 'pretty',
                }}
              >
                {classement.tropPeu.length > 1
                  ? `${classement.tropPeu.length} questions n’apparaissent pas`
                  : '1 question n’apparaît pas'}{' '}
                dans ce classement : moins de {TENTATIVES_FIABLES} réponses, un taux n’y
                voudrait rien dire.{' '}
                <button
                  type="button"
                  onClick={() => definir({ vue: 'tropPeu', vus: String(PAR_PAGE) })}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    font: 'inherit',
                    color: 'var(--accent-primary)',
                    fontWeight: 'var(--weight-semibold)',
                    cursor: 'pointer',
                  }}
                >
                  Les voir
                </button>
              </p>
            )}

            {total === 0 && (
              <EtatVide
                icone="check"
                titre={
                  vue === 'ratees'
                    ? 'Pas encore de question assez servie'
                    : vue === 'tropPeu'
                      ? 'Aucune question en attente de réponses'
                      : 'Toutes les questions ont été servies'
                }
                texte={
                  vue === 'ratees'
                    ? `Il faut ${TENTATIVES_FIABLES} réponses sur une même question pour que son taux d’échec veuille dire quelque chose.`
                    : 'Rien à signaler de ce côté.'
                }
              />
            )}

            <ChargerPlus
              affichees={vue === 'jamais' ? Math.min(vus, jamais.length) : visibles.length}
              total={total}
              parPage={PAR_PAGE}
              nom="questions"
              onPlus={() => definir({ vus: String(vus + PAR_PAGE) })}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div>
              <TitreSection indice="taux d’échec cumulé">Par formation</TitreSection>
              <Carte
                rayon="var(--radius-lg)"
                rembourrage="18px 20px"
                elevation="petite"
                style={{
                  marginTop: 'var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                {fragilites.length === 0 ? (
                  <Meta>Aucune réponse enregistrée pour l’instant.</Meta>
                ) : (
                  fragilites.map((fragilite) => (
                    <span
                      key={fragilite.formation.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <FormeFormation
                        fichier={identiteVisuelle(fragilite.formation).fichier}
                        taille={20}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 'var(--body-sm-size)',
                            color: 'var(--text-body)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={fragilite.formation.nom}
                        >
                          {fragilite.formation.nom}
                        </span>
                        <span style={{ display: 'block', marginTop: 5 }}>
                          <Jauge
                            valeur={fragilite.tauxEchec}
                            hauteur={5}
                            ton={
                              fragilite.tauxEchec > 50
                                ? 'var(--status-danger)'
                                : 'var(--neutral-100)'
                            }
                          />
                        </span>
                      </span>
                      <span
                        style={{
                          flex: 'none',
                          width: 38,
                          textAlign: 'right',
                          fontSize: 'var(--body-sm-size)',
                          fontWeight: 'var(--weight-semibold)',
                        }}
                      >
                        {fragilite.tauxEchec} %
                      </span>
                    </span>
                  ))
                )}
              </Carte>
            </div>

            <Carte rayon="var(--radius-lg)" rembourrage="18px 20px" elevation="petite">
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--body-sm-size)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--text-heading)',
                }}
              >
                Comment lire cet écran
              </span>
              <p
                style={{
                  margin: '10px 0 0',
                  fontSize: 'var(--body-sm-size)',
                  lineHeight: 1.55,
                  color: 'var(--neutral-70)',
                  textWrap: 'pretty',
                }}
              >
                Un taux d’échec élevé désigne d’abord une question à reformuler ou un
                argumentaire à clarifier. Les réponses sont agrégées sans identifiant : cet
                écran dit ce qui fait trébucher l’équipe, jamais qui trébuche.
              </p>
            </Carte>
          </div>
        </div>
      )}
    </div>
  );
}

function Chiffre({
  libelle,
  valeur,
  note,
  alerte = false,
}: {
  libelle: string;
  valeur: string;
  note: string;
  alerte?: boolean;
}) {
  return (
    <Carte rayon="var(--radius-lg)" rembourrage="18px 20px" elevation="petite">
      <Meta style={{ fontSize: 12 }}>{libelle}</Meta>
      <span
        style={{
          display: 'block',
          marginTop: 6,
          fontFamily: 'var(--font-display)',
          fontSize: 32,
          lineHeight: 1,
          color: alerte ? 'var(--status-danger-texte)' : 'var(--text-heading)',
        }}
      >
        {valeur}
      </span>
      <span
        style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}
      >
        {note}
      </span>
    </Carte>
  );
}

function LigneQuestion({
  question,
  formation,
  ligne,
  avecTaux = false,
  onOuvrir,
}: {
  question: Question;
  formation: Formation | null;
  ligne?: LigneStat;
  avecTaux?: boolean;
  onOuvrir: () => void;
}) {
  return (
    <Carte
      rayon="var(--radius-lg)"
      rembourrage="14px 20px"
      elevation="petite"
      className="ligne-tableau"
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}
    >
      {formation && (
        <span className="colonne-fixe" style={{ flex: 'none' }}>
          <FormeFormation fichier={identiteVisuelle(formation).fichier} taille={24} />
        </span>
      )}

      <span className="colonne-souple" style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={onOuvrir}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 'var(--body-md-size)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          {question.enonce}
        </button>
        <span style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 5, flexWrap: 'wrap' }}>
          <Meta style={{ fontSize: 12 }}>{LIBELLES_TYPE[question.type]}</Meta>
          <Meta style={{ fontSize: 12 }}>{formation?.nom ?? 'Formation retirée'}</Meta>
        </span>
      </span>

      {ligne && avecTaux && (
        <span className="colonne-fixe" style={{ flex: 'none', width: 110 }}>
          <Jauge
            valeur={ligne.tauxEchec}
            hauteur={5}
            ton={ligne.tauxEchec > 50 ? 'var(--status-danger)' : 'var(--status-warning)'}
          />
        </span>
      )}

      <span
        className="colonne-fixe"
        style={{
          flex: 'none',
          minWidth: 96,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        {ligne && avecTaux && (
          <span
            style={{
              fontSize: 'var(--body-md-size)',
              fontWeight: 'var(--weight-semibold)',
              color:
                ligne.tauxEchec > 50 ? 'var(--status-danger-texte)' : 'var(--text-heading)',
            }}
          >
            {ligne.tauxEchec} %
          </span>
        )}
        <Meta style={{ fontSize: 12 }}>
          {ligne
            ? `${ligne.echecs}/${ligne.tentatives}`
            : 'jamais servie'}
        </Meta>
      </span>

      <span className="colonne-fixe" style={{ flex: 'none', display: 'flex' }}>
        <Icone nom="chevronRight" taille={16} couleur="var(--neutral-40)" />
      </span>
    </Carte>
  );
}
