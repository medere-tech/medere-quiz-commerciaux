'use client';

import { useMemo } from 'react';
import type { Route } from 'next';

import { Bouton, Carte, Meta, Onglets, TitrePage } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { FormeFormation } from '@/composants/ds/parcours';
import {
  useDonneesParcours,
  type ParcoursSeme,
  type Referentiel,
} from '@/composants/parcours/donnees';
import { identiteVisuelle } from '@/lib/formations/depot';
import { LIBELLES_TYPE, TYPES_QUESTION } from '@/lib/questions/modele';
import { entierBorne, useParametresUrl } from '@/lib/navigation/parametres-url';
import {
  estTri,
  LIBELLES_TRI,
  trierARevoir,
  TRIS,
  vuQuand,
  type Tri,
} from '@/lib/serie/revision';
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

const DEFAUTS = { format: 'tous', tri: 'echecs', vus: String(PAR_PAGE) };

/**
 * « Trier par … »
 *
 * **Un `select` natif, dépouillé.** La maquette dessine un libellé et un
 * chevron, sans cadre : c'est un réglage, pas un champ de formulaire. Le
 * contrôle natif garde pour rien ce qu'un faux menu coûterait à refaire — le
 * clavier, le lecteur d'écran, et la roue crantée du téléphone.
 */
function ChoixDeTri({ valeur, onChoisir }: { valeur: Tri; onChoisir: (tri: Tri) => void }) {
  return (
    <label className="revoir-tri">
      <Meta style={{ fontSize: 'var(--body-sm-size)' }}>Trier par</Meta>
      <span className="revoir-tri-valeur">
        <select
          value={valeur}
          onChange={(evenement) => onChoisir(evenement.target.value as Tri)}
          aria-label="Trier les questions à revoir"
        >
          {TRIS.map((option) => (
            <option key={option} value={option}>
              {LIBELLES_TRI[option]}
            </option>
          ))}
        </select>
        <Icone nom="chevronDown" taille={15} />
      </span>
    </label>
  );
}

export function ARevoir({
  referentiel,
  parcours,
}: {
  referentiel: Referentiel;
  /** Semé par le serveur : l'écran s'affiche rempli, sans lecture cliente. */
  parcours?: ParcoursSeme;
}) {
  const chargement = useDonneesParcours(referentiel, parcours);
  const { valeurs, definir } = useParametresUrl(DEFAUTS);

  const format = valeurs.format;
  /* Un tri inventé dans l'adresse retombe sur le défaut : une URL se modifie à
     la main, et `?tri=au-hasard` ne doit pas vider la liste. */
  const tri: Tri = estTri(valeurs.tri) ? valeurs.tri : 'echecs';
  const vus = entierBorne(valeurs.vus, PAR_PAGE, 1);

  const aRevoir = useMemo(() => {
    if (chargement.etat !== 'pret') return [];
    const { questions, etats, formations } = chargement.donnees;

    // Le compte d'échecs se déduit de l'état, sans relire l'historique :
    // tentatives moins réussites. Une question ratée en compte au moins un.
    const ratees = new Map(
      etats.filter((etat) => etat.derniereRatee).map((etat) => [etat.id, etat]),
    );
    const nomDeFormation = new Map(
      formations.map((formation) => [formation.id, formation.nom]),
    );

    return questions
      .filter((question) => ratees.has(question.id))
      .map((question) => {
        const etat = ratees.get(question.id)!;
        return {
          id: question.id,
          question,
          echecs: Math.max(1, etat.tentatives - etat.reussies),
          /* La date de dernière vue existe déjà sur l'état — `majLe`, écrite à
             chaque réponse. Rien de nouveau n'est stocké pour l'afficher. */
          vueLeMs: etat.vueLeMs,
          formation: nomDeFormation.get(question.formationIds[0] ?? '') ?? '',
        };
      });
  }, [chargement]);

  /*
   * **Filtrer puis trier, et les deux en mémoire.** Ni l'un ni l'autre ne
   * touche au réseau : la liste entière est déjà là, et le paramètre d'adresse
   * se pose par l'historique du navigateur, sans navigation — voir
   * `useParametresUrl`.
   */
  const filtrees = useMemo(() => {
    const retenues =
      format === 'tous' ? aRevoir : aRevoir.filter((ligne) => ligne.question.type === format);
    return trierARevoir(retenues, tri);
  }, [aRevoir, format, tri]);

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


  /*
   * Le geste de l'écran, écrit une fois. En-tête au bureau, pied fixe sur
   * téléphone — deux emplacements, un seul libellé.
   */
  const rattrapage = (
    <Bouton
      taille="lg"
      iconeGauche={<Icone nom="refresh" taille={16} />}
      href={'/serie?mode=rattrapage' as Route}
    >
      Série de rattrapage
    </Bouton>
  );

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
            /* Sur téléphone, cette action descend dans le pied fixe, comme la
               maquette la place. Deux boutons pour un geste valent moins qu'un. */
            <span className="action-doublee">{rattrapage}</span>
          ) : undefined
        }
      />

      {aRevoir.length === 0 ? (
        <EtatVide
          icone="check"
          titre="Tout est acquis pour l’instant"
          texte="Lancez une série ordinaire : le tirage sert en priorité les questions jamais vues."
          actions={
            <Bouton iconeGauche={<Icone nom="play" taille={16} />} href={'/serie' as Route}>
              Lancer une série
            </Bouton>
          }
        />
      ) : (
        <>
          {/* Les filtres de format ne paraissent pas sur téléphone : la
              maquette mobile ne les dessine pas, quatre pastilles y prennent
              deux lignes, et la liste qu'elles filtrent y est courte. */}
          <div
            className="revoir-filtres"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}
          >
            <Onglets
              items={[
                { valeur: 'tous', libelle: 'Tous les formats' },
                ...TYPES_QUESTION.map((type) => ({ valeur: type, libelle: LIBELLES_TYPE[type] })),
              ]}
              valeur={format}
              onChange={(valeur) => definir({ format: valeur, vus: String(PAR_PAGE) })}
            />
            <span
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <Meta>
                {filtrees.length} question{filtrees.length > 1 ? 's' : ''}
              </Meta>
              <ChoixDeTri valeur={tri} onChoisir={(suivant) => definir({ tri: suivant })} />
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibles.map(({ question, echecs, vueLeMs }) => {
              const vu = vuQuand(vueLeMs);
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

                  {/*
                    * **La date de dernière vue, et le geste qui va avec.**
                    *
                    * La maquette les pose côte à côte en fin de ligne : savoir
                    * qu'une question traîne depuis trois semaines et pouvoir
                    * la reprendre tout de suite sont la même pensée.
                    *
                    * Rien quand la date manque — un état écrit avant que
                    * `majLe` existe. Une colonne vide vaut mieux qu'un tiret
                    * dont personne ne sait ce qu'il dit.
                    */}
                  <span
                    className="colonne-fixe revoir-vu"
                    style={{ flex: 'none', width: 96, textAlign: 'right' }}
                  >
                    {vu && <Meta style={{ fontSize: 12 }}>Vu {vu}</Meta>}
                  </span>

                  {/* Masqué sur téléphone, où la maquette ne dessine ni cette
                      action ni la date : la liste s'y lit, et le geste est la
                      série de rattrapage du pied fixe. Masqué sur l'enveloppe
                      et non sur le bouton — `Bouton` pose son `display` en
                      style en ligne, et le piège a déjà coûté trois fois. */}
                  <span className="colonne-fixe revoir-reprise" style={{ flex: 'none' }}>
                    <Bouton
                      taille="sm"
                      variante="secondaire"
                      href={`/serie?question=${encodeURIComponent(question.id)}` as Route}
                    >
                      Retravailler
                    </Bouton>
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

      {aRevoir.length > 0 && <div className="pied-mobile">{rattrapage}</div>}
    </div>
  );
}
