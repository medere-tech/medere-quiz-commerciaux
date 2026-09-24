'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Bouton, Carte, Meta, TitreSection } from '@/composants/ds/primitives';
import { EtatErreur, EtatVide, Squelettes } from '@/composants/ds/etats';
import { Jauge } from '@/composants/ds/parcours';
import { Icone } from '@/composants/ds/Icone';
import { ArreterSeance } from '@/composants/session/ArreterSeance';
import { DetailSeancePassee, dateCourte } from '@/composants/session/DetailSeancePassee';
import { SeanceQuiBloque } from '@/composants/session/SeanceQuiBloque';
import type { Referentiel } from '@/composants/parcours/donnees';
import { authentification } from '@/lib/firebase/client';
import {
  abandonner,
  chargerBilan,
  lancerSeance,
  mesSeances,
  supprimerSeance,
  terminerSession,
  vivantes,
  type LigneBilan,
  type Session,
} from '@/lib/session/depot';
import {
  dureeAnnonceeMinutes,
  dureeEcouleeMinutes,
  titreDeSeance,
} from '@/lib/session/seance';
import { echecMoyen } from '@/lib/session/bilan';

/**
 * Page 7 · Séances prêtes et passées.
 *
 * **La vue racine de la section.** La maquette sépare ce qui était mélangé au
 * lot 7 : composer est un écran, consulter en est un autre. Celui-ci répond à
 * deux questions du mardi matin — qu'est-ce qui est prêt à lancer, et
 * qu'est-ce qui a trébuché la dernière fois.
 *
 * **Le détail de la dernière séance est à droite, pas en dessous.** À 1440 il
 * tient dans le même écran que la liste ; sous 1200 il devient une vue à part,
 * atteinte en cliquant une ligne. C'est le découpage de la maquette, et il
 * évite une page qu'on ferait défiler pour comparer deux chiffres.
 */

/** Quatre séances passées, comme la maquette les compte. */
const PASSEES_MONTREES = 4;

/** Au-delà, le taux d'échec d'une séance passe en rouge. */
const SEUIL_GRAVE = 50;

type Etat = 'chargement' | 'pret' | 'echec';

export function SeancesCollectives({ referentiel }: { referentiel: Referentiel }) {
  const routeur = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [etat, setEtat] = useState<Etat>('chargement');
  const [seances, setSeances] = useState<Session[]>([]);
  /*
   * **Le bilan voyage avec l'identifiant de sa séance.**
   *
   * Le remettre à `null` dans l'effet avant de recharger provoquait un rendu
   * en cascade. En gardant l'identifiant à côté de la valeur, un bilan d'une
   * autre séance se reconnaît au rendu et s'ignore — même motif que la
   * question vive de l'écran de séance.
   */
  const [bilanLu, setBilanLu] = useState<{ id: string; lignes: LigneBilan[] } | null>(null);
  const [tour, setTour] = useState(0);

  useEffect(() => authentification().onAuthStateChanged((u) => setUid(u?.uid ?? null)), []);

  useEffect(() => {
    if (!uid) return;
    let vivant = true;

    mesSeances(uid)
      .then((liste) => {
        if (vivant) {
          setSeances(liste);
          setEtat('pret');
        }
      })
      .catch((panne: unknown) => {
        const code = (panne as { code?: string })?.code;
        console.error(`Lecture des séances impossible${code ? ` (${code})` : ''}`, panne);
        if (vivant) setEtat('echec');
      });

    return () => {
      vivant = false;
    };
  }, [uid, tour]);

  const pretes = useMemo(
    () => seances.filter((seance) => seance.statut === 'attente'),
    [seances],
  );

  /*
   * **Toutes les vivantes, pas la première trouvée.** `find` n'en montrait
   * qu'une : avec deux séances ouvertes — ce que rien n'empêche, voir le
   * README — la seconde était invisible, donc impossible à clore depuis le
   * seul écran où l'on constate le problème. La dernière lancée d'abord.
   */
  const ouvertes = useMemo(() => vivantes(seances), [seances]);
  const enCours = ouvertes[0];

  /** Les closes, la plus récente d'abord. */
  const passees = useMemo(
    () =>
      seances
        .filter((seance) => seance.statut === 'terminee' || seance.statut === 'abandonnee')
        .sort((gauche, droite) => quand(droite) - quand(gauche)),
    [seances],
  );

  const derniere = passees[0] ?? null;

  /* Le panneau ne lit que le bilan de la séance qu'il montre. */
  useEffect(() => {
    if (!derniere) return;
    const identifiant = derniere.id;
    let vivant = true;

    chargerBilan(identifiant)
      .then((lignes) => {
        if (vivant) setBilanLu({ id: identifiant, lignes: lignes ?? [] });
      })
      .catch((panne: unknown) => {
        console.error('Lecture du bilan impossible', panne);
        if (vivant) setBilanLu({ id: identifiant, lignes: [] });
      });

    return () => {
      vivant = false;
    };
  }, [derniere]);

  // `null` tant que le bilan de CETTE séance n'est pas arrivé.
  const bilan = derniere && bilanLu?.id === derniere.id ? bilanLu.lignes : null;

  /*
   * Clore une séance depuis la liste : on relit ensuite, pour que la carte
   * disparaisse et que « Lancer » redevienne possible sans rechargement.
   */
  /*
   * **Le refus de lancement, et il est nominatif.** L'identifiant de la séance
   * qu'on vient d'essayer de lancer pendant qu'une autre tourne. Porté ici
   * plutôt que dans la rangée : une seule à la fois peut être refusée, et le
   * lancement d'une autre doit effacer le refus précédent.
   */
  const [refusee, setRefusee] = useState<string>();

  const clore = useCallback(async (geste: Promise<unknown>) => {
    await geste;
    setTour((valeur) => valeur + 1);
  }, []);

  const reprendreLesRatees = useCallback(
    (questionIds: string[]) => {
      const parametres = new URLSearchParams({ ratees: questionIds.join(',') });
      routeur.push(`/admin/session/composer?${parametres.toString()}` as Route);
    },
    [routeur],
  );

  if (!uid || etat === 'chargement') {
    return (
      <div className="preparer">
        <Squelettes lignes={5} />
      </div>
    );
  }

  if (etat === 'echec') {
    return (
      <div className="preparer">
        <EtatErreur
          titre="Séances indisponibles"
          texte="La liste de vos séances n’a pas pu être lue. Réessayez dans un instant."
        />
      </div>
    );
  }

  return (
    <div className="preparer">
      <header className="preparer-entete">
        <div>
          <h1 className="preparer-titre">Séances collectives</h1>
          <p className="preparer-sous-titre">
            {pretes.length === 0
              ? 'Aucune séance n’est prête.'
              : `${pretes.length === 1 ? 'Une séance est prête' : `${pretes.length} séances sont prêtes`} à lancer.`}
          </p>
        </div>
        {/*
          * Au large, l'action vit dans l'en-tête, là où la maquette la place.
          * Sur téléphone, elle descend en pied fixe — voir plus bas.
          */}
        <Bouton
          taille="lg"
          className="preparer-action-entete"
          href={'/admin/session/composer' as Route}
          iconeGauche={<Icone nom="plus" taille={16} />}
          style={{ whiteSpace: 'nowrap', flex: 'none' }}
        >
          Préparer une séance
        </Bouton>
      </header>

      <div className="preparer-grille">
        <div className="preparer-colonne">
          {/*
            * Une séance ouverte passe avant tout : c'est là qu'il faut aller.
            *
            * **Et c'est aussi là qu'on la clôt.** Arrêter une séance obligeait
            * à ouvrir l'écran d'animation — c'est-à-dire à projeter une séance
            * qu'on voulait justement fermer. Noémie voit le problème ici ; le
            * geste est ici.
            */}
          {ouvertes.map((ouverte) => (
            <Carte
              key={ouverte.id}
              rayon="var(--radius-lg)"
              rembourrage="18px 22px"
              style={{
                marginBottom: 'var(--air-bloc)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ flex: 1, minWidth: 200 }}>
                <span
                  style={{ display: 'block', fontSize: 'var(--body-md-size)', fontWeight: 600 }}
                >
                  {titreDeSeance(ouverte)} - {ouverte.statut === 'pause' ? 'en pause' : 'en cours'}
                </span>
                <Meta style={{ fontSize: 13 }}>
                  {ouverte.demarree
                    ? `Question ${ouverte.indexCourant + 1} sur ${ouverte.questionIds.length}`
                    : 'La salle est ouverte, la première question n’est pas posée.'}
                </Meta>
              </span>
              <ArreterSeance
                presentation="salle"
                onTerminer={() => void clore(terminerSession(ouverte.id))}
                onAbandonner={() => void clore(abandonner(ouverte.id))}
                questionsJouees={ouverte.demarree ? ouverte.indexCourant + 1 : 0}
                questionsTotal={ouverte.questionIds.length}
              />
              <Bouton
                href={'/animer' as Route}
                iconeGauche={<Icone nom="presentation" taille={15} />}
              >
                Reprendre l’animation
              </Bouton>
            </Carte>
          ))}

          <TitreSection indice="préparées, pas encore lancées">Prêtes à lancer</TitreSection>

          {pretes.length === 0 ? (
            <div style={{ marginTop: 'var(--air-bloc)' }}>
              <EtatVide
                icone="layers"
                titre="Aucune séance préparée"
                texte="Composez-en une : elle restera modifiable jusqu’au lancement."
              />
            </div>
          ) : (
            <div className="seances-liste">
              {pretes.map((seance) => (
                <SeancePrete
                  key={seance.id}
                  seance={seance}
                  surLancer={() => {
                    /* **On refuse, on ne clôt pas à sa place.** Terminer la
                       précédente emporterait son classement sans que personne
                       ne l'ait demandé. */
                    if (enCours) {
                      setRefusee(seance.id);
                      return;
                    }
                    setRefusee(undefined);
                    void lancerSeance(seance.id).then(() => routeur.push('/animer' as Route));
                  }}
                  blocage={
                    refusee === seance.id && enCours ? (
                      <SeanceQuiBloque
                        seance={enCours}
                        onTerminer={() => void clore(terminerSession(enCours.id))}
                        onAbandonner={() => void clore(abandonner(enCours.id))}
                      />
                    ) : undefined
                  }
                  surSupprimer={() => {
                    void supprimerSeance(seance.id).then(() => setTour((valeur) => valeur + 1));
                  }}
                />
              ))}
            </div>
          )}

          <div className="seances-bloc-passees">
            <TitreSection indice={`${Math.min(passees.length, PASSEES_MONTREES)} dernières`}>
              Séances passées
            </TitreSection>

            {passees.length === 0 ? (
              <Meta style={{ display: 'block', marginTop: 'var(--air-bloc)' }}>
                Aucune séance n’a encore été jouée.
              </Meta>
            ) : (
              <div className="seances-passees-liste">
                {passees.slice(0, PASSEES_MONTREES).map((seance, rang) => (
                  <LignePassee key={seance.id} seance={seance} derniere={rang === 0} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/*
         * Le détail de la dernière séance. La grille le masque sous 1200 px :
         * à cette largeur, la maquette en fait une vue à part, atteinte en
         * cliquant une ligne.
         */}
        {derniere ? (
          <DetailSeancePassee
            className="preparer-detail"
            seance={derniere}
            bilan={bilan}
            questions={referentiel.questions}
            formations={referentiel.formations}
            onReprendreLesRatees={reprendreLesRatees}
          />
        ) : (
          <Carte
            className="preparer-detail"
            rayon="var(--radius-2xl)"
            rembourrage="32px"
            style={{ alignSelf: 'start' }}
          >
            <Meta>
              Le détail de la dernière séance s’affichera ici dès qu’une séance aura été jouée.
            </Meta>
          </Carte>
        )}
      </div>

      {/*
        * Le pied d'action du téléphone. La maquette met « Préparer une séance »
        * en secondaire ici — l'écran sert d'abord à consulter ce qui est prêt.
        */}
      <div className="preparer-pied-mobile">
        <Bouton
          taille="lg"
          variante="secondaire"
          href={'/admin/session/composer' as Route}
          iconeGauche={<Icone nom="plus" taille={16} />}
        >
          Préparer une séance
        </Bouton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ séance prête */

function SeancePrete({
  seance,
  surLancer,
  surSupprimer,
  blocage,
}: {
  seance: Session;
  surLancer: () => void;
  surSupprimer: () => void;
  /**
   * Ce qui s'affiche quand le lancement est refusé : la séance qui bloque, et
   * de quoi la clore. Rendu **dans cette rangée**, sous le bouton qu'on vient
   * de presser — un refus qui renverrait vers un autre écran ferait perdre le
   * fil.
   */
  blocage?: React.ReactNode;
}) {
  const minutes = dureeAnnonceeMinutes(seance);

  const tuiles: [string, string][] = [
    [String(seance.questionIds.length), 'questions'],
    [minutes === null ? 'libre' : `${minutes} min`, minutes === null ? 'durée' : 'estimées'],
    [
      seance.dureeQuestionSecondes === 0 ? 'sans' : `${seance.dureeQuestionSecondes} s`,
      'par question',
    ],
  ];

  return (
    <Carte rayon="var(--radius-xl)" rembourrage="24px 26px">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 200 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--heading-sm-size)',
              fontWeight: 600,
              color: 'var(--text-heading)',
            }}
          >
            {titreDeSeance(seance)}
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 8,
              fontSize: 'var(--body-sm-size)',
              lineHeight: 1.5,
              color: 'var(--neutral-70)',
            }}
          >
            {seance.description !== '' ? seance.description : `Code ${seance.code}`}
          </span>
        </span>
        <span style={{ flex: 'none', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Bouton
            taille="sm"
            variante="secondaire"
            href={`/admin/session/composer?reprendre=${seance.id}` as Route}
            iconeGauche={<Icone nom="pencil" taille={15} />}
          >
            Reprendre
          </Bouton>
          <Bouton taille="sm" iconeGauche={<Icone nom="play" taille={15} />} onClick={surLancer}>
            Lancer
          </Bouton>
          <Bouton
            taille="sm"
            variante="fantome"
            aria-label={`Supprimer « ${titreDeSeance(seance)} »`}
            onClick={surSupprimer}
          >
            <Icone nom="trash" taille={15} />
          </Bouton>
        </span>
      </div>

      <div className="seance-tuiles">
        {tuiles.map(([valeur, libelle]) => (
          <span key={libelle} className="seance-tuile">
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 21,
                lineHeight: 1,
                color: 'var(--text-heading)',
              }}
            >
              {valeur}
            </span>
            <Meta style={{ fontSize: 13 }}>{libelle}</Meta>
          </span>
        ))}
      </div>

      {blocage}
    </Carte>
  );
}

/* ----------------------------------------------------------- séance passée */

function LignePassee({ seance, derniere }: { seance: Session; derniere: boolean }) {
  const [taux, setTaux] = useState<number | null>(null);
  const ecoulees = dureeEcouleeMinutes(seance);

  /*
   * Le taux d'échec d'une séance vient de son bilan, un document par séance.
   * Quatre lignes affichées, donc quatre lectures — de quoi remplir la colonne
   * sans dénormaliser un chiffre de plus sur la séance.
   */
  useEffect(() => {
    let vivant = true;
    chargerBilan(seance.id)
      .then((lignes) => {
        if (vivant) setTaux(lignes ? echecMoyen(lignes) : null);
      })
      .catch(() => {
        // Un bilan illisible n'empêche pas de lire la ligne : la mesure
        // manque, le reste s'affiche.
        if (vivant) setTaux(null);
      });
    return () => {
      vivant = false;
    };
  }, [seance.id]);

  return (
    <Link
      className="seance-passee"
      data-derniere={derniere ? 'oui' : 'non'}
      href={`/admin/session/${seance.id}` as Route}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-md-size)',
            fontWeight: 600,
            color: 'var(--text-heading)',
          }}
        >
          {titreDeSeance(seance)}
        </span>
        <span style={{ display: 'flex', gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
          <Meta style={{ fontSize: 13 }}>{dateCourte(quand(seance) || null)}</Meta>
          <Meta style={{ fontSize: 13 }}>{seance.questionIds.length} questions</Meta>
          <Meta style={{ fontSize: 13 }}>{seance.presentsFinal} présents</Meta>
          {ecoulees !== null && <Meta style={{ fontSize: 13 }}>{ecoulees} min</Meta>}
        </span>
      </span>

      <span className="seance-mesure">
        {taux === null ? (
          <Meta style={{ fontSize: 13 }}>-</Meta>
        ) : (
          <>
            <span style={{ flex: 1 }}>
              <Jauge
                valeur={taux}
                ton={taux > SEUIL_GRAVE ? 'var(--status-danger)' : 'var(--status-warning)'}
                hauteur={5}
              />
            </span>
            <span
              style={{
                fontSize: 'var(--body-sm-size)',
                fontWeight: 600,
                color: 'var(--text-heading)',
              }}
            >
              {taux} %
            </span>
          </>
        )}
      </span>

      <Icone nom="chevronRight" taille={17} couleur="var(--neutral-40)" />
    </Link>
  );
}

/** Quand la séance a eu lieu : sa clôture, sinon son ouverture, sinon sa création. */
function quand(seance: Session): number {
  return seance.termineeLeMs ?? seance.ouverteLeMs ?? seance.creeeLeMs ?? 0;
}
