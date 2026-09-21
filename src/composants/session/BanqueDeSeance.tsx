'use client';

import { useMemo, useState } from 'react';

import { Bouton, Champ, Meta, Onglets, Selecteur } from '@/composants/ds/primitives';
import { FormeFormation } from '@/composants/ds/parcours';
import { Icone } from '@/composants/ds/Icone';
import { Etape } from '@/composants/session/Etape';
import { identiteVisuelle } from '@/lib/formations/depot';
import type { Formation } from '@/lib/formations/depot';
import type { QuestionListee } from '@/lib/questions/lecture';
import { LIBELLES_TYPE, TYPES_QUESTION } from '@/lib/questions/modele';

/**
 * Étape 1 — choisir les questions.
 *
 * **La banque défile dans sa propre zone, et nulle part ailleurs.** Les
 * filtres restent en haut, le bouton « afficher plus » reste en bas, et seul
 * le milieu bouge. C'est ce qui permet de filtrer sans perdre les filtres de
 * vue au premier coup de molette — et c'est le détail qui sépare une liste
 * dessinée d'une liste posée dans une page.
 *
 * **Elle est groupée par formation**, parce que c'est ainsi qu'on la parcourt
 * quand elle compte plusieurs centaines d'entrées, et triée par taux d'échec
 * décroissant à l'intérieur de chaque groupe : ce qui a le plus trébuché est
 * ce qu'on veut reposer.
 *
 * **Le numéro dans la case est le rang de passage.** Pas une coche : le lien
 * entre la banque et l'ordre de passage doit se voir sans traduire.
 */

const SANS_FILTRE = 'toutes';

/** Les trois vues de la maquette, dans son ordre. */
type Vue = 'toutes' | 'jamais' | 'ratees';

const VUES: { valeur: Vue; libelle: string }[] = [
  { valeur: 'toutes', libelle: 'Toutes' },
  { valeur: 'jamais', libelle: 'Jamais posées' },
  { valeur: 'ratees', libelle: 'Les plus ratées' },
];

/**
 * En dessous, un taux d'échec ne veut rien dire.
 *
 * Une question posée deux fois et ratée une fois n'est pas « à 50 % d'échec » :
 * elle n'a pas été posée assez souvent pour qu'on en tire quoi que ce soit.
 * Le filtre « les plus ratées » l'écarte plutôt que de la hisser en tête.
 */
const TENTATIVES_FIABLES = 5;

/** Ce que la banque a besoin de savoir sur une question, au-delà de l'énoncé. */
export type AttributsQuestion = {
  /** Entier de 0 à 100, ou `null` faute de réponses assez nombreuses. */
  tauxEchec: number | null;
  /** Dernière fois qu'elle a été posée en séance, en millisecondes. */
  poseeLeMs: number | null;
};

export function BanqueDeSeance({
  questions,
  formations,
  attributs,
  choisies,
  onBasculer,
  onPrendreFormation,
}: {
  questions: QuestionListee[];
  formations: Formation[];
  attributs: Map<string, AttributsQuestion>;
  /** Identifiants retenus, dans l'ordre de passage. */
  choisies: string[];
  onBasculer: (identifiant: string) => void;
  onPrendreFormation: (identifiants: string[]) => void;
}) {
  const [recherche, setRecherche] = useState('');
  const [formation, setFormation] = useState(SANS_FILTRE);
  const [type, setType] = useState(SANS_FILTRE);
  const [vue, setVue] = useState<Vue>('toutes');
  const [combien, setCombien] = useState(50);

  const rangs = useMemo(() => new Map(choisies.map((id, rang) => [id, rang + 1])), [choisies]);

  const filtrees = useMemo(() => {
    const cherche = recherche.trim().toLowerCase();

    return questions.filter((question) => {
      if (formation !== SANS_FILTRE && !question.formationIds.includes(formation)) return false;
      if (type !== SANS_FILTRE && question.type !== type) return false;
      if (cherche !== '' && !question.enonce.toLowerCase().includes(cherche)) return false;

      const attribut = attributs.get(question.id);
      if (vue === 'jamais') return attribut?.poseeLeMs == null;
      if (vue === 'ratees') return (attribut?.tauxEchec ?? null) !== null;
      return true;
    });
  }, [questions, formation, type, recherche, vue, attributs]);

  /*
   * Le tri est celui que le pied de liste annonce : taux d'échec décroissant.
   * Une question sans taux fiable passe après toutes celles qui en ont un —
   * elle n'est pas « à zéro pour cent », on ne sait simplement pas.
   */
  const triees = useMemo(() => {
    return [...filtrees].sort((gauche, droite) => {
      const a = attributs.get(gauche.id)?.tauxEchec;
      const b = attributs.get(droite.id)?.tauxEchec;
      if (a == null && b == null) return gauche.enonce.localeCompare(droite.enonce, 'fr');
      if (a == null) return 1;
      if (b == null) return -1;
      return b - a;
    });
  }, [filtrees, attributs]);

  const visibles = triees.slice(0, combien);

  /* Le groupement suit l'ordre des formations du référentiel, pas du hasard. */
  const groupes = useMemo(() => {
    const parFormation = new Map<string, QuestionListee[]>();
    for (const question of visibles) {
      const cle = question.formationIds[0] ?? '';
      const liste = parFormation.get(cle);
      if (liste) liste.push(question);
      else parFormation.set(cle, [question]);
    }
    return [...parFormation.entries()].map(([id, liste]) => ({
      formation: formations.find((candidate) => candidate.id === id) ?? null,
      questions: liste,
      /** Combien la formation en compte, servies, tous filtres confondus. */
      total: questions.filter((question) => (question.formationIds[0] ?? '') === id).length,
    }));
  }, [visibles, formations, questions]);

  return (
    <div className="banque">
      <Etape
        numero={1}
        aside={
          <Meta style={{ fontSize: 13 }}>
            {/* « Servies » et non « publiées » : depuis le troisième statut,
                cette banque contient aussi les questions à relire — ce sont
                celles qui font trébucher, donc la matière d'un jeudi. Dire
                « publiées » désignerait un sous-ensemble de ce qui est compté. */}
            {questions.length} servies, {choisies.length} retenues
          </Meta>
        }
      >
        Choisissez les questions
      </Etape>

      <div className="banque-filtres">
        <Champ
          value={recherche}
          onChange={(valeur) => {
            setRecherche(valeur);
            setCombien(50);
          }}
          placeholder="Rechercher"
          aria-label="Rechercher une question"
          autoComplete="off"
          prefixe={<Icone nom="search" taille={17} couleur="var(--neutral-50)" />}
          style={{ width: 238, flex: 'none' }}
        />
        <Selecteur
          value={formation}
          onChange={(valeur) => {
            setFormation(valeur);
            setCombien(50);
          }}
          options={[
            { valeur: SANS_FILTRE, libelle: 'Toutes les formations' },
            ...formations.map((item) => ({ valeur: item.id, libelle: item.nom })),
          ]}
          style={{ width: 208, flex: 'none' }}
        />
        <Selecteur
          value={type}
          onChange={(valeur) => {
            setType(valeur);
            setCombien(50);
          }}
          options={[
            { valeur: SANS_FILTRE, libelle: 'Tous les formats' },
            ...TYPES_QUESTION.map((item) => ({
              valeur: item,
              libelle: LIBELLES_TYPE[item],
            })),
          ]}
          style={{ width: 176, flex: 'none' }}
        />
        <Onglets
          libelle="Filtrer la banque"
          items={VUES}
          valeur={vue}
          onChange={(valeur) => {
            setVue(valeur);
            setCombien(50);
          }}
        />
      </div>

      <div className="banque-zone">
        {groupes.length === 0 ? (
          <Meta style={{ fontSize: 'var(--body-sm-size)' }}>
            Aucune question publiée sous ce filtre. Élargissez la formation ou le format, ou
            publiez des questions depuis la banque.
          </Meta>
        ) : (
          groupes.map(({ formation: groupe, questions: lignes, total }) => {
            const visuel = groupe ? identiteVisuelle(groupe) : null;
            const identifiants = lignes.map((question) => question.id);
            const toutePrise = identifiants.every((id) => rangs.has(id));

            return (
              <div key={groupe?.id ?? 'sans-formation'}>
                <div className="banque-groupe-entete">
                  {visuel && <FormeFormation fichier={visuel.fichier} taille={24} />}
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 'var(--body-md-size)',
                      fontWeight: 600,
                      color: 'var(--text-heading)',
                    }}
                  >
                    {groupe?.nom ?? 'Sans formation'}
                  </h3>
                  <Meta style={{ fontSize: 13 }}>{total} servies</Meta>

                  {/*
                   * Prendre une formation entière ajoute ses questions à la
                   * suite, sans renuméroter celles qui étaient déjà retenues.
                   */}
                  <button
                    type="button"
                    className="banque-tout-prendre"
                    data-pris={toutePrise ? 'oui' : 'non'}
                    onClick={() => onPrendreFormation(identifiants)}
                  >
                    <Icone
                      nom={toutePrise ? 'check' : 'plus'}
                      taille={15}
                      epaisseur={toutePrise ? 2.2 : 1.8}
                    />
                    {toutePrise ? 'Formation entière retenue' : 'Tout prendre'}
                  </button>
                </div>

                <div className="banque-groupe-lignes">
                  {lignes.map((question) => {
                    const rang = rangs.get(question.id);
                    const attribut = attributs.get(question.id);
                    return (
                      <button
                        type="button"
                        key={question.id}
                        className="banque-question"
                        data-retenue={rang ? 'oui' : 'non'}
                        aria-pressed={Boolean(rang)}
                        onClick={() => onBasculer(question.id)}
                      >
                        <span className="banque-case" aria-hidden="true">
                          {rang ?? ''}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="banque-enonce">{question.enonce}</span>
                          <span className="banque-attributs">
                            <Meta style={{ fontSize: 13 }}>{LIBELLES_TYPE[question.type]}</Meta>
                            {attribut?.tauxEchec != null && (
                              <Meta style={{ fontSize: 13 }}>
                                {attribut.tauxEchec} % d’échec
                              </Meta>
                            )}
                            {attribut?.poseeLeMs != null && (
                              <span className="banque-deja-posee">
                                <Icone nom="alert" taille={13} epaisseur={1.9} />
                                Posée le {jourEtMois(attribut.poseeLeMs)}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="banque-pied">
        {triees.length > combien && (
          <Bouton taille="sm" variante="secondaire" onClick={() => setCombien(combien + 50)}>
            Afficher 50 questions de plus
          </Bouton>
        )}
        <Meta style={{ fontSize: 13 }}>
          {triees.length > combien
            ? 'Triées par taux d’échec décroissant.'
            : `${triees.length} question${triees.length > 1 ? 's' : ''}, triées par taux d’échec décroissant.`}
        </Meta>
      </div>
    </div>
  );
}

/** « 5 mars ». Sans l'année : on ne repose pas une question d'il y a deux ans. */
export function jourEtMois(millisecondes: number): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(
    new Date(millisecondes),
  );
}

/** Le seuil au-dessous duquel un taux d'échec ne se calcule pas. */
export { TENTATIVES_FIABLES };
