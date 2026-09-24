'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { estServie } from '@/lib/questions/modele';

import { Bouton, Onglets } from '@/composants/ds/primitives';
import { EtatErreur, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import {
  BanqueDeSeance,
  TENTATIVES_FIABLES,
  type AttributsQuestion,
} from '@/composants/session/BanqueDeSeance';
import { PanneauComposition, CADENCES } from '@/composants/session/PanneauComposition';
import { SeanceQuiBloque } from '@/composants/session/SeanceQuiBloque';
import type { Referentiel } from '@/composants/parcours/donnees';
import { authentification } from '@/lib/firebase/client';
import { chargerStatistiques } from '@/lib/statistiques/depot';
import { tauxEchec } from '@/lib/statistiques/analyse';
import {
  abandonner,
  creerSession,
  maSessionEnCours,
  mesSeances,
  modifierSeance,
  preparerEtLancer,
  terminerSession,
  type Session,
} from '@/lib/session/depot';
import { titreParDefaut } from '@/lib/session/seance';

/**
 * Page 7 · Composer une séance.
 *
 * **Repris entièrement au lot 11.** L'écran du lot 7 avait été assemblé sans
 * maquette : filtres, liste, pied collant, le tout sur une seule colonne qui
 * mêlait la composition, les séances prêtes et l'historique. La maquette
 * sépare les trois, numérote les étapes, et donne à la banque sa propre zone
 * de défilement. C'est cette version-là.
 *
 * **Trois étapes, deux dispositions.** Au-delà de 1200 px, deux colonnes : la
 * banque à gauche sur toute la hauteur, le formulaire à droite. En dessous, la
 * maquette ne replie pas — elle change de navigation, et les trois étapes
 * deviennent trois onglets. Empiler aurait donné une page de trois mètres où
 * l'on perd de vue ce qu'on a retenu.
 *
 * **Le tirage ne fait pas la séance.** Elle porte sur ce que Noémie vient de
 * présenter : elle choisit, et l'ordre des cases est l'ordre de passage.
 */

type Etat = 'chargement' | 'pret' | 'echec';

/** Les trois onglets de la vue étroite, dans l'ordre des étapes. */
type Onglet = 'decrire' | 'choisir' | 'ordonner';

const ONGLETS: { valeur: Onglet; libelle: string }[] = [
  { valeur: 'decrire', libelle: 'Description et minutage' },
  { valeur: 'choisir', libelle: 'Questions' },
  { valeur: 'ordonner', libelle: 'Ordre de passage' },
];

export function ComposerSeance({
  referentiel,
  /** Séance préparée à reprendre, ou questions à pré-cocher. */
  reprise,
  ratees,
}: {
  referentiel: Referentiel;
  reprise?: string;
  ratees?: string[];
}) {
  const routeur = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [animateurNom, setAnimateurNom] = useState('');
  const [etat, setEtat] = useState<Etat>('chargement');
  const [enregistrement, setEnregistrement] = useState(false);
  const [echecEcriture, setEchecEcriture] = useState<string | null>(null);

  /*
   * La séance qui tourne déjà et qui interdit d'en lancer une seconde. Le
   * geste pour la clore est rendu ici même : renvoyer vers la liste ferait
   * perdre la composition en cours, et Noémie reviendrait de toute façon.
   */
  const [bloquePar, setBloquePar] = useState<Session | null>(null);

  const [titre, setTitre] = useState(() => titreParDefaut());
  const [description, setDescription] = useState('');
  const [duree, setDuree] = useState<number>(30);
  const [sansChronometre, setSansChronometre] = useState(false);
  const [choisies, setChoisies] = useState<string[]>(ratees ?? []);
  const [onglet, setOnglet] = useState<Onglet>('choisir');

  /** Taux d'échec et dernière fois posée, par question. */
  const [attributs, setAttributs] = useState<Map<string, AttributsQuestion>>(new Map());

  useEffect(
    () =>
      authentification().onAuthStateChanged((utilisateur) => {
        setUid(utilisateur?.uid ?? null);
        setAnimateurNom(utilisateur?.displayName ?? '');
      }),
    [],
  );

  /*
   * Ce qu'on peut mettre dans une séance : tout ce qui sort aux commerciaux.
   *
   * **Les questions à relire comprises, et c'est le bon choix** : ce sont
   * précisément celles qui font trébucher, donc la matière d'un jeudi. La
   * banque les signale par leur étiquette — Noémie voit qu'elle en compose une
   * avant de la retenir.
   */
  const publiees = useMemo(
    () => referentiel.questions.filter((question) => estServie(question.statut)),
    [referentiel.questions],
  );

  /*
   * Deux lectures, en parallèle : les statistiques agrégées pour le taux
   * d'échec, et les séances de l'animatrice pour savoir ce qui a déjà été
   * posé. L'une sans l'autre donnerait une banque à moitié renseignée, où
   * l'on ne saurait pas si une colonne manque ou vaut zéro.
   */
  useEffect(() => {
    if (!uid) return;
    let vivant = true;

    Promise.all([chargerStatistiques(), mesSeances(uid)])
      .then(([stats, seances]) => {
        if (!vivant) return;

        const posees = derniereFois(seances);
        const table = new Map<string, AttributsQuestion>();

        for (const question of publiees) {
          const stat = stats.find((ligne) => ligne.questionId === question.id);
          table.set(question.id, {
            tauxEchec:
              stat && stat.tentatives >= TENTATIVES_FIABLES
                ? tauxEchec(stat.echecs, stat.tentatives)
                : null,
            poseeLeMs: posees.get(question.id) ?? null,
          });
        }

        setAttributs(table);

        // Reprendre une séance préparée : on repart de ce qu'elle contient.
        const aReprendre = reprise ? seances.find((seance) => seance.id === reprise) : undefined;
        if (aReprendre) {
          setTitre(aReprendre.titre);
          setDescription(aReprendre.description);
          setChoisies(aReprendre.questionIds);
          setSansChronometre(aReprendre.dureeQuestionSecondes === 0);
          if (aReprendre.dureeQuestionSecondes > 0) setDuree(aReprendre.dureeQuestionSecondes);
        }

        setEtat('pret');
      })
      .catch((panne: unknown) => {
        const code = (panne as { code?: string })?.code;
        console.error(`Lecture de la banque impossible${code ? ` (${code})` : ''}`, panne);
        if (vivant) setEtat('echec');
      });

    return () => {
      vivant = false;
    };
  }, [uid, publiees, reprise]);

  const basculer = useCallback((identifiant: string) => {
    setChoisies((actuelles) =>
      actuelles.includes(identifiant)
        ? actuelles.filter((autre) => autre !== identifiant)
        : [...actuelles, identifiant],
    );
  }, []);

  /**
   * Prendre une formation entière.
   *
   * **Les rangs déjà attribués ne bougent pas.** On retire du choix ce qui
   * appartenait à cette formation, puis on ajoute le groupe entier à la fin :
   * les questions retenues ailleurs gardent leur numéro, et le groupe arrive
   * d'un bloc, dans l'ordre de la liste. Recliquer le rend.
   */
  const prendreFormation = useCallback((identifiants: string[]) => {
    setChoisies((actuelles) => {
      const toutePrise = identifiants.every((id) => actuelles.includes(id));
      const sansCeGroupe = actuelles.filter((id) => !identifiants.includes(id));
      return toutePrise ? sansCeGroupe : [...sansCeGroupe, ...identifiants];
    });
  }, []);

  const deplacer = useCallback((identifiant: string, pas: -1 | 1) => {
    setChoisies((actuelles) => {
      const depuis = actuelles.indexOf(identifiant);
      const vers = depuis + pas;
      if (depuis < 0 || vers < 0 || vers >= actuelles.length) return actuelles;
      const suivantes = [...actuelles];
      const [deplacee] = suivantes.splice(depuis, 1);
      suivantes.splice(vers, 0, deplacee as string);
      return suivantes;
    });
  }, []);

  const annonce = useMemo(
    () => ({ titre, description, animateurNom }),
    [titre, description, animateurNom],
  );

  const ecrire = useCallback(
    async (lancer: boolean) => {
      if (!uid || choisies.length === 0 || titre.trim() === '') return;
      setEnregistrement(true);
      setEchecEcriture(null);

      const secondes = sansChronometre ? 0 : duree;

      try {
        if (reprise) {
          await modifierSeance(reprise, choisies, secondes, { titre, description });
        } else if (lancer) {
          /*
           * **On vérifie qu'aucune séance ne tourne, et au moment du clic.**
           *
           * Une lecture au montage aurait vieilli : Noémie compose pendant dix
           * minutes, et la séance d'à côté peut s'être ouverte entretemps. Ce
           * n'est qu'un garde-fou — les règles ne savent pas interroger une
           * collection, donc elles ne peuvent pas interdire deux séances
           * vivantes — mais c'est le geste ordinaire qu'il faut tenir.
           */
          const vivante = await maSessionEnCours(uid);
          if (vivante) {
            setBloquePar(vivante);
            setEnregistrement(false);
            return;
          }

          // Un seul chemin d'ouverture : on prépare, puis on lance.
          await preparerEtLancer(uid, choisies, secondes, annonce);
          routeur.push('/animer' as Route);
          return;
        } else {
          await creerSession(uid, choisies, secondes, 'attente', annonce);
        }
        routeur.push('/admin/session' as Route);
      } catch (panne) {
        /*
         * La cause est journalisée, jamais avalée. Au lot 9, un `catch` muet
         * a masqué un refus de règles pendant deux déploiements : le code
         * Firestore désigne la cause, et `permission-denied` désigne les
         * règles.
         */
        const code = (panne as { code?: string })?.code;
        console.error(`Écriture de la séance refusée${code ? ` (${code})` : ''}`, panne);
        setEchecEcriture(
          code === 'permission-denied'
            ? 'Les règles ont refusé cette séance. Vérifiez qu’elles sont bien déployées.'
            : 'La séance n’a pas pu être enregistrée. Réessayez dans un instant.',
        );
        setEnregistrement(false);
      }
    },
    [uid, choisies, titre, description, duree, sansChronometre, reprise, annonce, routeur],
  );

  if (!uid || etat === 'chargement') {
    return (
      <div className="preparer preparer--cadre">
        <Squelettes lignes={5} />
      </div>
    );
  }

  if (etat === 'echec') {
    return (
      <div className="preparer">
        <EtatErreur
          titre="Banque indisponible"
          texte="Les questions et leurs statistiques n’ont pas pu être lues. Réessayez dans un instant."
        />
      </div>
    );
  }

  const banque = (
    <BanqueDeSeance
      questions={publiees}
      formations={referentiel.formations}
      attributs={attributs}
      choisies={choisies}
      onBasculer={basculer}
      onPrendreFormation={prendreFormation}
    />
  );

  const panneau = (
    <PanneauComposition
      titre={titre}
      onTitre={setTitre}
      description={description}
      onDescription={setDescription}
      duree={duree}
      onDuree={setDuree}
      sansChronometre={sansChronometre}
      onSansChronometre={setSansChronometre}
      choisies={choisies}
      questions={publiees}
      formations={referentiel.formations}
      onRetirer={basculer}
      onDeplacer={deplacer}
      enregistrement={enregistrement}
      onLancer={() => void ecrire(true)}
      onEnregistrer={() => void ecrire(false)}
      libelleEnregistrer={reprise ? 'Enregistrer les modifications' : 'Enregistrer et fermer'}
    />
  );

  return (
    <div className="preparer preparer--cadre">
      <header className="preparer-entete">
        <div>
          <h1 className="preparer-titre">
            {reprise ? 'Reprendre la séance' : 'Préparer la séance du jeudi'}
          </h1>
          <p className="preparer-sous-titre">
            Elle reste modifiable jusqu’au lancement. Rien n’est visible des commerciaux avant
            que vous ne lanciez.
          </p>
        </div>
        <Bouton
          variante="fantome"
          taille="lg"
          href={'/admin/session' as Route}
          iconeGauche={<Icone nom="clock" taille={16} />}
          style={{ whiteSpace: 'nowrap', flex: 'none' }}
        >
          Séances et historique
        </Bouton>
      </header>

      {bloquePar && (
        <SeanceQuiBloque
          seance={bloquePar}
          onTerminer={() => {
            void terminerSession(bloquePar.id).then(() => setBloquePar(null));
          }}
          onAbandonner={() => {
            void abandonner(bloquePar.id).then(() => setBloquePar(null));
          }}
        />
      )}

      {echecEcriture && (
        <p
          role="alert"
          style={{
            margin: 'var(--air-bloc) 0 0',
            color: 'var(--status-danger-texte)',
            fontSize: 'var(--body-sm-size)',
          }}
        >
          {echecEcriture}
        </p>
      )}

      {/*
       * Les onglets n'existent qu'en dessous de 1200 px — la feuille de style
       * les montre ou les cache. Au large, les trois étapes sont côte à côte
       * et un onglet n'aurait rien à sélectionner.
       */}
      <div className="preparer-onglets">
        <Onglets
          items={ONGLETS}
          valeur={onglet}
          onChange={setOnglet}
          libelle="Étapes de la composition"
        />
      </div>

      {/*
        * L'onglet actif est porté par la grille, et c'est la feuille de style
        * qui montre ou cache. Rendre deux fois le panneau pour deux onglets
        * aurait dupliqué ses champs — et son `id` de chronomètre avec eux.
        */}
      <div className="preparer-grille" data-onglet={onglet}>
        <div className="preparer-colonne">{banque}</div>
        {panneau}
      </div>
    </div>
  );
}

/**
 * La dernière fois que chaque question a été posée.
 *
 * **Une séance préparée ne compte pas** : elle n'a pas encore été jouée, et
 * signaler « déjà posée » pour une question qui attend dans une séance du
 * jeudi prochain serait faux. On ne retient que ce qui a tourné.
 */
export function derniereFois(seances: Session[]): Map<string, number> {
  const dates = new Map<string, number>();

  for (const seance of seances) {
    if (seance.statut === 'attente') continue;
    const quand = seance.termineeLeMs ?? seance.ouverteLeMs ?? seance.creeeLeMs;
    if (quand === null) continue;

    for (const questionId of seance.questionIds) {
      const connue = dates.get(questionId);
      if (connue === undefined || quand > connue) dates.set(questionId, quand);
    }
  }

  return dates;
}

export { CADENCES };
