import type { Route } from 'next';

import { RetourStatistiques } from '@/composants/admin/RetourStatistiques';
import { Bouton, Carte, EtiquetteStatut, Meta, TitreSection } from '@/composants/ds/primitives';
import { EtatVide } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { FormeFormation, Jauge } from '@/composants/ds/parcours';
import { lireSession } from '@/lib/auth/session-serveur';
import { identiteVisuelle } from '@/lib/formations/identite';
import {
  LIBELLES_STATUT,
  LIBELLES_TYPE,
  TONS_STATUT,
  type StatutQuestion,
} from '@/lib/questions/modele';
import { TENTATIVES_FIABLES, tauxEchec } from '@/lib/statistiques/analyse';
import { chargerResultatsQuestion, type ResultatsQuestion } from '@/lib/serveur/maitrise-equipe';

/**
 * 12 · Une question et ses résultats, par commercial.
 *
 * L'écran « 06b » du tri des maquettes, écarté au lot 3 et réactivé par la
 * décision du 30 septembre 2026. On y arrive depuis une ligne des
 * statistiques : le taux d'échec dit ce qui fait trébucher l'équipe, la liste
 * « Par commercial » dit qui, pour l'accompagner.
 *
 * **Conforme à la maquette 12**, élément par élément : l'en-tête et ses deux
 * actions, la répartition des réponses, l'explication publiée, le taux d'échec
 * et la liste par commercial.
 *
 * - **La répartition** compte les options cochées par les commerciaux — un
 *   total par proposition, sans nom (`maitrise-equipe.ts`).
 * - **« Mettre en session »** ouvre la composition avec cette question déjà
 *   cochée : la composition sait recevoir des questions par `?ratees=`.
 *
 * Page serveur de bout en bout : les données viennent de `maitrise-equipe.ts`,
 * et rien d'autre que les composants du système ne part au navigateur.
 */

type Parametres = { params: Promise<{ questionId: string }> };

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
});

export default async function PageResultatsQuestion({ params }: Parametres) {
  // Pas d'administrateur connecté : la disposition rend la connexion ou le
  // refus, et ce que cette page renvoie est écarté. On ne lit rien.
  const session = await lireSession();
  if (!session?.admin) return null;

  const { questionId } = await params;
  const resultats = await chargerResultatsQuestion(questionId);

  if (!resultats) {
    return (
      <div className="page-admin">
        <EtatVide
          icone="layers"
          titre="Cette question n’est pas servie"
          texte="Elle est en brouillon, a été supprimée, ou l’adresse ne désigne aucune question. Ses résultats ne s’affichent qu’une fois publiée."
          actions={<Bouton href={'/admin/statistiques' as Route}>Retour aux statistiques</Bouton>}
        />
      </div>
    );
  }

  const statut = resultats.statut as StatutQuestion;
  const meta = [
    resultats.formation?.nom,
    LIBELLES_TYPE[resultats.type]?.toLowerCase(),
    resultats.modifieeLeMs ? `modifiée le ${DATE.format(new Date(resultats.modifieeLeMs))}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="page-admin">
      <RetourStatistiques />
      <div className="entete-question-resultats">
        <div style={{ maxWidth: 700, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {resultats.formation && (
              <FormeFormation fichier={identiteVisuelle(resultats.formation).fichier} taille={26} />
            )}
            <EtiquetteStatut ton={TONS_STATUT[statut] ?? 'brouillon'}>
              {LIBELLES_STATUT[statut] ?? resultats.statut}
            </EtiquetteStatut>
            <Meta style={{ fontSize: 12 }}>{meta}</Meta>
          </span>
          <h1
            style={{
              margin: '16px 0 0',
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 30,
              lineHeight: 1.16,
              color: 'var(--text-heading)',
              textWrap: 'pretty',
            }}
          >
            {resultats.enonce}
          </h1>
        </div>
        <span style={{ flex: 'none', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Bouton
            taille="lg"
            variante="secondaire"
            href={`/admin/session/composer?ratees=${encodeURIComponent(resultats.questionId)}` as Route}
            iconeGauche={<Icone nom="presentation" taille={16} />}
          >
            Mettre en session
          </Bouton>
          <Bouton
            taille="lg"
            href={`/admin/questions/${resultats.questionId}` as Route}
            iconeGauche={<Icone nom="pencil" taille={16} />}
          >
            Modifier
          </Bouton>
        </span>
      </div>

      <div className="grille-deux-colonnes" style={{ gridTemplateColumns: 'minmax(0, 1fr) 336px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Repartition resultats={resultats} />

          <div>
          <TitreSection>Explication publiée</TitreSection>
          <Carte
            rayon="var(--radius-lg)"
            rembourrage="18px 20px"
            elevation="petite"
            style={{ marginTop: 'var(--space-4)' }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 'var(--body-md-size)',
                lineHeight: 1.6,
                color: 'var(--neutral-80)',
                textWrap: 'pretty',
              }}
            >
              {resultats.explication || 'Aucune explication n’est rédigée pour cette question.'}
            </p>
          </Carte>
          </div>
        </div>

        <div className="colonne-collante" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <TauxEchec stats={resultats.stats} />
          <ParCommercial commerciaux={resultats.commerciaux} />
        </div>
      </div>
    </div>
  );
}

function TauxEchec({ stats }: { stats: ResultatsQuestion['stats'] }) {
  const taux = stats ? tauxEchec(stats.echecs, stats.tentatives) : null;
  const fiable = stats !== null && stats.tentatives >= TENTATIVES_FIABLES;

  return (
    <Carte rayon="var(--radius-xl)" rembourrage="20px 22px">
      <Meta style={{ fontSize: 13 }}>Taux d’échec</Meta>
      <span
        style={{
          display: 'block',
          marginTop: 6,
          fontFamily: 'var(--font-display)',
          fontSize: 40,
          lineHeight: 1,
          color:
            taux !== null && fiable && taux > 50
              ? 'var(--status-danger-texte)'
              : 'var(--text-heading)',
        }}
      >
        {taux === null ? '—' : `${taux} %`}
      </span>
      <span
        style={{
          display: 'block',
          marginTop: 8,
          fontSize: 'var(--body-sm-size)',
          lineHeight: 1.5,
          color: 'var(--neutral-70)',
          textWrap: 'pretty',
        }}
      >
        {stats === null
          ? 'Aucune réponse enregistrée pour l’instant.'
          : `${stats.tentatives} réponse${stats.tentatives > 1 ? 's' : ''}, dont ${stats.echecs} ratée${stats.echecs > 1 ? 's' : ''}.` +
            (fiable ? '' : ` Moins de ${TENTATIVES_FIABLES} réponses : ce taux ne veut encore rien dire.`)}
      </span>
    </Carte>
  );
}

/**
 * Chaque commercial, et où il en est sur cette question : sa dernière
 * tentative juste, ratée, ou la question jamais vue. C'est l'état que lit son
 * propre parcours — une question ratée hier et réussie aujourd'hui est juste.
 */
function ParCommercial({ commerciaux }: { commerciaux: ResultatsQuestion['commerciaux'] }) {
  return (
    <div>
      <TitreSection>Par commercial</TitreSection>
      <Carte
        rayon="var(--radius-lg)"
        rembourrage="16px 18px"
        elevation="petite"
        style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {commerciaux.length === 0 ? (
          <Meta>Aucun commercial ne s’est encore connecté.</Meta>
        ) : (
          commerciaux.map(({ uid, nom, etat }) => {
            const verdict = !etat.dejaVue ? 'jamais' : etat.derniereRatee ? 'ratee' : 'juste';
            return (
              <span
                key={uid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: verdict === 'ratee' ? 'rgba(194,66,66,0.06)' : 'transparent',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    flex: 'none',
                    borderRadius: 999,
                    background:
                      verdict === 'jamais'
                        ? 'var(--neutral-30)'
                        : verdict === 'juste'
                          ? 'var(--status-success)'
                          : 'var(--status-danger)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {verdict !== 'jamais' && (
                    <Icone nom={verdict === 'juste' ? 'check' : 'close'} taille={10} epaisseur={2.5} />
                  )}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 'var(--body-sm-size)',
                    color: 'var(--text-body)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {nom}
                </span>
                <Meta style={{ fontSize: 12, flex: 'none' }}>
                  {verdict === 'jamais' ? 'jamais vue' : verdict === 'juste' ? 'juste' : 'ratée'}
                </Meta>
              </span>
            );
          })
        )}
      </Carte>
    </div>
  );
}

/**
 * La répartition des réponses : pour chaque proposition, la part des réponses
 * qui l'ont cochée. La bonne réponse porte sa coche et sa teinte de réussite ;
 * les autres, leur lettre. Sur un choix multiple, une réponse coche plusieurs
 * propositions : les parts n'additionnent pas cent, et c'est exact.
 */
function Repartition({ resultats }: { resultats: ResultatsQuestion }) {
  const total = resultats.reponsesComptees;
  return (
    <div>
      <TitreSection
        indice={
          total === 0
            ? 'aucune réponse enregistrée'
            : `${total} réponse${total > 1 ? 's' : ''} enregistrée${total > 1 ? 's' : ''}`
        }
      >
        Répartition des réponses
      </TitreSection>
      <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {resultats.repartition.map((option, index) => {
          const part = total === 0 ? 0 : Math.round((option.nombre / total) * 100);
          return (
            <Carte
              key={option.optionId}
              rayon="var(--radius-lg)"
              rembourrage="14px 18px"
              elevation="petite"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 24,
                  height: 24,
                  flex: 'none',
                  borderRadius: 999,
                  background: option.juste ? 'var(--status-success)' : 'var(--surface-chip)',
                  color: option.juste ? '#fff' : 'var(--neutral-70)',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {option.juste ? <Icone nom="check" taille={13} epaisseur={2.3} /> : String.fromCharCode(65 + index)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--body-md-size)', color: 'var(--text-body)', textWrap: 'pretty' }}>
                {option.libelle}
                {/* La coche verte ne se lit pas au lecteur d'écran : on le dit. */}
                {option.juste && (
                  <span
                    style={{
                      position: 'absolute',
                      width: 1,
                      height: 1,
                      overflow: 'hidden',
                      clip: 'rect(0 0 0 0)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {' '}
                    (bonne réponse)
                  </span>
                )}
              </span>
              <span className="jauge-repartition" style={{ flex: 'none', width: 150 }}>
                <Jauge
                  valeur={part}
                  hauteur={5}
                  ton={option.juste ? 'var(--status-success)' : 'var(--neutral-30)'}
                />
              </span>
              <span
                style={{
                  flex: 'none',
                  width: 42,
                  textAlign: 'right',
                  fontSize: 'var(--body-md-size)',
                  fontWeight: 'var(--weight-semibold)',
                  whiteSpace: 'nowrap',
                }}
              >
                {part} %
              </span>
            </Carte>
          );
        })}
      </div>
    </div>
  );
}
