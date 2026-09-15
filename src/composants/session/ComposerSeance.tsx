'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Bouton, Carte, EtiquetteStatut, Meta, Selecteur, TitrePage, TitreSection } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { HistoriqueSeances } from '@/composants/session/HistoriqueSeances';
import { ListeQuestionsSeance } from '@/composants/session/ListeQuestionsSeance';
import type { Referentiel } from '@/composants/parcours/donnees';
import { authentification } from '@/lib/firebase/client';
import { LIBELLES_TYPE, TYPES_QUESTION, type TypeQuestion } from '@/lib/questions/modele';
import {
  creerSession,
  lancerSeance,
  mesSeances,
  supprimerSeance,
  type Session,
} from '@/lib/session/depot';

/**
 * Composer une séance à l'avance.
 *
 * **La séance porte sur ce que Noémie vient de présenter, pas sur un tirage.**
 * Jusqu'ici l'écran d'animation prenait les huit premières questions publiées :
 * c'était un dépannage, pas une fonctionnalité. Elle choisit désormais.
 *
 * **Une séance préparée est une séance `attente`.** Le modèle le prévoyait
 * depuis le lot 1 ; la lancer revient à la passer à `encours`. Aucun champ
 * nouveau. Préparée le mardi, lancée le jeudi : c'est le cas normal, et c'est
 * pour lui que l'état existe.
 *
 * **Les filtres viennent du référentiel déjà chargé par le serveur.** La banque
 * a ses filtres Firestore pour paginer deux cents questions ; ici, le
 * référentiel des questions publiées est déjà en mémoire — celui-là même qui
 * sert au tirage des séries. Le refiltrer côté navigateur ne coûte rien et
 * évite un aller-retour par changement de filtre.
 */

const SANS_FILTRE = 'toutes';

export function ComposerSeance({ referentiel }: { referentiel: Referentiel }) {
  const routeur = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [seances, setSeances] = useState<Session[] | null>(null);
  const [echec, setEchec] = useState(false);

  const [formation, setFormation] = useState<string>(SANS_FILTRE);
  const [type, setType] = useState<string>(SANS_FILTRE);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [duree, setDuree] = useState(45);
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => authentification().onAuthStateChanged((u) => setUid(u?.uid ?? null)), []);

  /*
   * Un compteur plutôt qu'un appel direct : l'effet ne fait qu'écouter une
   * valeur qui change, et React ne voit pas de `setState` posé dans son corps.
   */
  const [rafraichir, setRafraichir] = useState(0);
  const recharger = useCallback(() => setRafraichir((tour) => tour + 1), []);

  useEffect(() => {
    if (!uid) return;
    let vivant = true;

    mesSeances(uid)
      .then((liste) => {
        if (vivant) setSeances(liste);
      })
      .catch(() => {
        if (vivant) setEchec(true);
      });

    return () => {
      vivant = false;
    };
  }, [uid, rafraichir]);

  const publiees = useMemo(
    () => referentiel.questions.filter((question) => question.statut === 'publiee'),
    [referentiel.questions],
  );

  const visibles = useMemo(
    () =>
      publiees.filter(
        (question) =>
          (formation === SANS_FILTRE || question.formationIds.includes(formation)) &&
          (type === SANS_FILTRE || question.type === type),
      ),
    [publiees, formation, type],
  );

  /*
   * La dernière fois que chaque question a été posée.
   *
   * On ne bloque pas : reposer une question mal comprise est exactement ce
   * qu'on veut pouvoir faire. On le signale, et Noémie décide.
   */
  const derniereFois = useMemo(() => {
    const dates = new Map<string, number>();
    for (const seance of seances ?? []) {
      if (seance.statut === 'attente' || seance.creeeLeMs === null) continue;
      for (const questionId of seance.questionIds) {
        const connue = dates.get(questionId);
        if (connue === undefined || seance.creeeLeMs > connue) dates.set(questionId, seance.creeeLeMs);
      }
    }
    return dates;
  }, [seances]);

  const enCours = seances?.find((seance) => seance.statut === 'encours' || seance.statut === 'pause');
  const preparees = seances?.filter((seance) => seance.statut === 'attente') ?? [];

  const basculer = (identifiant: string) =>
    setChoisies((actuelles) =>
      actuelles.includes(identifiant)
        ? actuelles.filter((autre) => autre !== identifiant)
        : [...actuelles, identifiant],
    );

  const enregistrer = useCallback(async () => {
    if (!uid || choisies.length === 0) return;
    setEnregistrement(true);
    try {
      await creerSession(uid, choisies, duree, 'attente');
      setChoisies([]);
      recharger();
    } catch {
      setEchec(true);
    } finally {
      setEnregistrement(false);
    }
  }, [uid, choisies, duree, recharger]);

  if (!uid || seances === null) {
    return (
      <div className="page-admin">
        <Squelettes lignes={5} />
      </div>
    );
  }

  if (echec) {
    return (
      <div className="page-admin">
        <EtatErreur
          titre="Séances indisponibles"
          texte="La liste de vos séances n’a pas pu être lue. Réessayez dans un instant."
        />
      </div>
    );
  }

  return (
    <div
      className="page-admin"
      /*
       * De la place sous le dernier bloc quand le pied est collant : sinon il
       * recouvre en permanence la fin de l'historique, et rien n'indique qu'il
       * y a quelque chose dessous.
       */
      style={choisies.length > 0 ? { paddingBottom: 180 } : undefined}
    >
      <TitrePage
        titre="Session collective"
        sous="Composez la séance du jeudi à l’avance, puis lancez-la le jour venu. Les questions choisies sont posées dans l’ordre où vous les cochez."
      />

      {/* Une séance déjà ouverte passe avant tout le reste : c'est là qu'il
          faut aller, pas dans la composition d'une nouvelle. */}
      {enCours && (
        <Carte
          rayon="var(--radius-lg)"
          rembourrage="18px 22px"
          elevation="carte"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
        >
          <EtiquetteStatut ton={enCours.statut === 'pause' ? 'attention' : 'publiee'}>
            {enCours.statut === 'pause' ? 'En pause' : 'En direct'}
          </EtiquetteStatut>
          <span style={{ flex: 1, minWidth: 200 }}>
            <span style={{ display: 'block', fontSize: 'var(--body-md-size)', fontWeight: 600 }}>
              Séance {enCours.code} en cours
            </span>
            <Meta style={{ fontSize: 12 }}>
              Question {enCours.indexCourant + 1} sur {enCours.questionIds.length}
            </Meta>
          </span>
          <Bouton href={'/animer' as Route} iconeGauche={<Icone nom="presentation" taille={15} />}>
            Reprendre l’animation
          </Bouton>
        </Carte>
      )}

      {preparees.length > 0 && (
        <div>
          <TitreSection indice={`${preparees.length} en attente`}>Séances préparées</TitreSection>
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preparees.map((seance) => (
              <Carte
                key={seance.id}
                rayon="var(--radius-lg)"
                rembourrage="14px 18px"
                elevation="petite"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
              >
                <span style={{ flex: 1, minWidth: 180 }}>
                  <span style={{ display: 'block', fontSize: 'var(--body-md-size)', fontWeight: 600 }}>
                    {seance.questionIds.length} question{seance.questionIds.length > 1 ? 's' : ''}
                  </span>
                  <Meta style={{ fontSize: 12 }}>
                    Code {seance.code} ·{' '}
                    {seance.dureeQuestionSecondes === 0
                      ? 'sans chronomètre'
                      : `${seance.dureeQuestionSecondes} s par question`}
                  </Meta>
                </span>
                <Bouton
                  variante="secondaire"
                  onClick={() => void supprimerSeance(seance.id).then(() => recharger())}
                >
                  Supprimer
                </Bouton>
                <Bouton
                  iconeGauche={<Icone nom="play" taille={15} />}
                  disabled={Boolean(enCours)}
                  onClick={() => {
                    void lancerSeance(seance.id).then(() => routeur.push('/animer' as Route));
                  }}
                >
                  Lancer
                </Bouton>
              </Carte>
            ))}
          </div>
          {enCours && (
            <Meta style={{ fontSize: 12 }}>
              Terminez la séance en cours avant d’en lancer une autre.
            </Meta>
          )}
        </div>
      )}

      <div>
        <TitreSection indice={`${visibles.length} question${visibles.length > 1 ? 's' : ''} publiée${visibles.length > 1 ? 's' : ''}`}>
          Composer une séance
        </TitreSection>

        <div
          style={{
            marginTop: 'var(--space-4)',
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Selecteur
            value={formation}
            onChange={setFormation}
            options={[
              { valeur: SANS_FILTRE, libelle: 'Toutes les formations' },
              ...referentiel.formations.map((f) => ({ valeur: f.id, libelle: f.nom })),
            ]}
          />
          <Selecteur
            value={type}
            onChange={setType}
            options={[
              { valeur: SANS_FILTRE, libelle: 'Tous les formats' },
              ...TYPES_QUESTION.map((t) => ({ valeur: t, libelle: LIBELLES_TYPE[t as TypeQuestion] })),
            ]}
          />
          <Bouton
            variante="secondaire"
            disabled={visibles.length === 0}
            onClick={() =>
              setChoisies((actuelles) => [
                ...actuelles,
                ...visibles.map((q) => q.id).filter((id) => !actuelles.includes(id)),
              ])
            }
          >
            Tout ajouter
          </Bouton>
          {choisies.length > 0 && (
            <Bouton variante="fantome" onClick={() => setChoisies([])}>
              Tout retirer
            </Bouton>
          )}
        </div>

        {visibles.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EtatVide
              icone="layers"
              titre="Aucune question publiée sous ce filtre"
              texte="Élargissez la formation ou le format, ou publiez des questions depuis la banque."
            />
          </div>
        ) : (
          <ListeQuestionsSeance
            questions={visibles}
            formations={referentiel.formations}
            choisies={choisies}
            derniereFois={derniereFois}
            onBasculer={basculer}
          />
        )}
      </div>

      <HistoriqueSeances seances={seances} questions={publiees} />

      {/* Le pied de composition ne paraît que s'il y a quelque chose à
          enregistrer : un encadré vide au bas de l'écran n'annonce rien. */}
      {choisies.length > 0 && (
        <Carte
          rayon="var(--radius-xl)"
          rembourrage="18px 22px"
          elevation="carte"
          style={{
            position: 'sticky',
            bottom: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ flex: 1, minWidth: 200 }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                lineHeight: 1.2,
                color: 'var(--text-heading)',
              }}
            >
              {choisies.length} question{choisies.length > 1 ? 's' : ''} dans la séance
            </span>
            <Meta style={{ fontSize: 13 }}>
              Posées dans l’ordre où vous les avez cochées.
            </Meta>
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Meta style={{ fontSize: 12 }}>Temps par question</Meta>
            {[0, 30, 45, 60].map((valeur) => (
              <Bouton
                key={valeur}
                taille="sm"
                variante={duree === valeur ? 'primaire' : 'secondaire'}
                onClick={() => setDuree(valeur)}
              >
                {valeur === 0 ? 'Sans' : `${valeur} s`}
              </Bouton>
            ))}
          </span>

          <Bouton
            taille="lg"
            disabled={enregistrement}
            iconeGauche={<Icone nom="check" taille={16} />}
            onClick={() => void enregistrer()}
          >
            {enregistrement ? 'Enregistrement…' : 'Préparer la séance'}
          </Bouton>
        </Carte>
      )}
    </div>
  );
}
