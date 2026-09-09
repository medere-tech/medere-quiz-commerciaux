'use client';

import { useMemo } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { Bouton, Carte, Meta, Onglets, TitrePage } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { FormeFormation } from '@/composants/ds/parcours';
import { useDonneesParcours, type Referentiel } from '@/composants/parcours/donnees';
import { identiteVisuelle } from '@/lib/formations/depot';
import { LIBELLES_TYPE, TYPES_QUESTION } from '@/lib/questions/modele';
import { entierBorne, useParametresUrl } from '@/lib/navigation/parametres-url';
import { ChargerPlus } from '@/composants/admin/ChargerPlus';

/**
 * 05 · Questions à revoir.
 *
 * La liste de ce qui reste à acquérir : les questions dont la **dernière**
 * tentative est un échec. Une question réussie depuis en sort d'elle-même,
 * sans geste — on ne demande à personne de tenir sa propre liste.
 *
 * **Écart avec la maquette.** Elle annonce que les questions reviennent
 * « jusqu'à deux réponses justes consécutives ». Le modèle du README ne
 * connaît pas cette règle : une question réussie retombe simplement à un
 * poids faible, puis plus faible encore à la deuxième réussite. Le texte suit
 * le modèle, pas la maquette — et il dit la règle appliquée plutôt que
 * « acquises », mot qu'aucun écran ne définit.
 */
const PAR_PAGE = 20;

const DEFAUTS = { format: 'tous', vus: String(PAR_PAGE) };

export function ARevoir({ referentiel }: { referentiel: Referentiel }) {
  const routeur = useRouter();
  const chargement = useDonneesParcours(referentiel);
  const { valeurs, definir } = useParametresUrl(DEFAUTS);

  const format = valeurs.format;
  const vus = entierBorne(valeurs.vus, PAR_PAGE, 1);

  const aRevoir = useMemo(() => {
    if (chargement.etat !== 'pret') return [];
    const { questions, etats } = chargement.donnees;

    // Le compte d'échecs se déduit de l'état, sans relire l'historique :
    // tentatives moins réussites. Une question ratée en compte au moins un.
    const ratees = new Map(
      etats
        .filter((etat) => etat.derniereRatee)
        .map((etat) => [etat.id, Math.max(1, etat.tentatives - etat.reussies)]),
    );

    return questions
      .filter((question) => ratees.has(question.id))
      .map((question) => ({ question, echecs: ratees.get(question.id) ?? 1 }))
      .sort((a, b) => b.echecs - a.echecs);
  }, [chargement]);

  const filtrees = useMemo(
    () => (format === 'tous' ? aRevoir : aRevoir.filter((ligne) => ligne.question.type === format)),
    [aRevoir, format],
  );

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
        <EtatErreur titre="Liste indisponible" texte={chargement.echec.texte} />
      </div>
    );
  }

  const formations = new Map(
    chargement.donnees.formations.map((formation) => [formation.id, formation]),
  );
  const visibles = filtrees.slice(0, vus);

  return (
    <div className="page-admin">
      <TitrePage
        titre="Questions à revoir"
        sous={
          aRevoir.length === 0
            ? 'Rien à rattraper : toutes vos dernières tentatives sont justes.'
            : `${aRevoir.length} question${aRevoir.length > 1 ? 's' : ''} ratée${aRevoir.length > 1 ? 's' : ''} à la dernière tentative. Elles reviennent en priorité dans vos séries, et sortent de cette liste dès que vous y répondez juste.`
        }
        actions={
          aRevoir.length > 0 ? (
            <Bouton
              taille="lg"
              iconeGauche={<Icone nom="refresh" taille={16} />}
              onClick={() => routeur.push('/serie?mode=rattrapage' as Route)}
            >
              Série de rattrapage
            </Bouton>
          ) : undefined
        }
      />

      {aRevoir.length === 0 ? (
        <EtatVide
          icone="check"
          titre="Tout est acquis pour l’instant"
          texte="Lancez une série ordinaire : les questions jamais vues sont celles qui vous feront progresser."
          actions={
            <Bouton iconeGauche={<Icone nom="play" taille={16} />} onClick={() => routeur.push('/serie' as Route)}>
              Lancer une série
            </Bouton>
          }
        />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Onglets
              items={[
                { valeur: 'tous', libelle: 'Tous les formats' },
                ...TYPES_QUESTION.map((type) => ({ valeur: type, libelle: LIBELLES_TYPE[type] })),
              ]}
              valeur={format}
              onChange={(valeur) => definir({ format: valeur, vus: String(PAR_PAGE) })}
            />
            <span style={{ marginLeft: 'auto' }}>
              <Meta>
                {filtrees.length} question{filtrees.length > 1 ? 's' : ''}
              </Meta>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibles.map(({ question, echecs }) => {
              const formation = formations.get(question.formationIds[0] ?? '');
              return (
                <Carte
                  key={question.id}
                  rayon="var(--radius-lg)"
                  rembourrage="16px 20px"
                  elevation="petite"
                  className="ligne-tableau"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}
                >
                  {formation && (
                    <span className="colonne-fixe" style={{ flex: 'none' }}>
                      <FormeFormation fichier={identiteVisuelle(formation).fichier} taille={26} />
                    </span>
                  )}
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
                      {question.enonce}
                    </span>
                    <span style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 5, flexWrap: 'wrap' }}>
                      <Meta style={{ fontSize: 12 }}>{LIBELLES_TYPE[question.type]}</Meta>
                      <Meta style={{ fontSize: 12 }}>{formation?.nom ?? 'Formation retirée'}</Meta>
                    </span>
                  </span>
                  <span
                    className="colonne-fixe"
                    style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7 }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: echecs >= 3 ? 'rgba(194,66,66,0.11)' : 'var(--surface-chip)',
                        color: echecs >= 3 ? 'var(--status-danger-texte)' : 'var(--neutral-70)',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {echecs}
                    </span>
                    <Meta style={{ fontSize: 12 }}>{echecs > 1 ? 'échecs' : 'échec'}</Meta>
                  </span>
                </Carte>
              );
            })}
          </div>

          <ChargerPlus
            affichees={visibles.length}
            total={filtrees.length}
            parPage={PAR_PAGE}
            nom="questions"
            onPlus={() => definir({ vus: String(vus + PAR_PAGE) })}
          />
        </>
      )}
    </div>
  );
}
