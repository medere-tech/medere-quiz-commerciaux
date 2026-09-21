'use client';

import { Bouton, Carte, Champ, Meta, ZoneDeTexte } from '@/composants/ds/primitives';
import { FormeFormation } from '@/composants/ds/parcours';
import { Icone } from '@/composants/ds/Icone';
import { Picto } from '@/composants/ds/Picto';
import { Etape } from '@/composants/session/Etape';
import { identiteVisuelle } from '@/lib/formations/depot';
import type { Formation } from '@/lib/formations/depot';
import type { QuestionListee } from '@/lib/questions/lecture';
import {
  DESCRIPTION_SEANCE_MAX,
  dureeAnnonceeMinutes,
  TITRE_SEANCE_MAX,
} from '@/lib/session/seance';

/**
 * Étapes 2 et 3 — décrire la séance, puis vérifier l'ordre de passage.
 *
 * **Le panneau ne s'étire pas.** Il fait sa hauteur de contenu et s'aligne en
 * haut, à côté d'une banque qui, elle, occupe toute la colonne. Deux surfaces
 * de hauteurs différentes côte à côte, c'est voulu : l'une est une liste qu'on
 * parcourt, l'autre un formulaire qu'on remplit.
 *
 * **L'ordre de passage n'affiche que cinq lignes**, et résume le reste. Un
 * panneau qui grandit avec la sélection finirait par pousser les deux boutons
 * hors de l'écran, et c'est exactement là qu'on a besoin d'eux.
 */

/** Les quatre cadences de la maquette. Zéro n'en est pas une : voir la case. */
export const CADENCES = [20, 30, 45, 60] as const;

/** Combien de lignes d'ordre le panneau montre avant de résumer. */
const LIGNES_MONTREES = 5;

export function PanneauComposition({
  titre,
  onTitre,
  description,
  onDescription,
  duree,
  onDuree,
  sansChronometre,
  onSansChronometre,
  choisies,
  questions,
  formations,
  onRetirer,
  onDeplacer,
  enregistrement,
  onLancer,
  onEnregistrer,
  libelleEnregistrer,
}: {
  titre: string;
  onTitre: (valeur: string) => void;
  description: string;
  onDescription: (valeur: string) => void;
  duree: number;
  onDuree: (valeur: number) => void;
  sansChronometre: boolean;
  onSansChronometre: (valeur: boolean) => void;
  choisies: string[];
  questions: QuestionListee[];
  formations: Formation[];
  onRetirer: (identifiant: string) => void;
  /** Déplace d'un rang. `-1` vers le haut, `+1` vers le bas. */
  onDeplacer: (identifiant: string, pas: -1 | 1) => void;
  enregistrement: boolean;
  onLancer: () => void;
  onEnregistrer: () => void;
  libelleEnregistrer: string;
}) {
  const vide = choisies.length === 0;
  const parId = new Map(questions.map((question) => [question.id, question]));
  const formationsParId = new Map(formations.map((formation) => [formation.id, formation]));

  const minutes = dureeAnnonceeMinutes({
    questionIds: choisies,
    dureeQuestionSecondes: sansChronometre ? 0 : duree,
  });

  const montrees = choisies.slice(0, LIGNES_MONTREES);
  const reste = choisies.length - montrees.length;

  return (
    <Carte
      className="panneau-composition"
      rayon="var(--radius-2xl)"
      rembourrage="34px var(--panneau-rembourrage-cote) var(--panneau-rembourrage-bas)"
    >
      <div className="panneau-etape panneau-etape-decrire">
      <Etape numero={2}>Décrivez la séance</Etape>

      <div className="panneau-champs">
        <Champ
          label="Titre"
          value={titre}
          onChange={(valeur) => onTitre(valeur.slice(0, TITRE_SEANCE_MAX))}
          erreur={titre.trim() === '' ? 'Une séance sans titre s’affiche sans nom.' : undefined}
          autoComplete="off"
        />
        <ZoneDeTexte
          label="Description"
          aide="Lue par les commerciaux au moment de rejoindre."
          value={description}
          onChange={(valeur) => onDescription(valeur.slice(0, DESCRIPTION_SEANCE_MAX))}
          lignes={2}
        />
      </div>

      <div style={{ marginTop: 'calc(var(--air-bloc) + 4px)' }}>
        <Chronometre
          duree={duree}
          onDuree={onDuree}
          eteint={sansChronometre}
          onEteindre={onSansChronometre}
        />
      </div>
      </div>

      {/*
        * Ni `display` ni `flex-direction` en style en ligne : ce sont les
        * onglets qui décident, et un style en ligne bat la feuille — c'est
        * exactement ce qui avait masqué la mise à plat mobile au lot 9.
        */}
      <div className="panneau-etape panneau-etape-ordre">
        <Etape numero={3}>Vérifiez l’ordre de passage</Etape>

        <div style={{ marginTop: 16 }}>
          <div className="estimation" data-vide={vide ? 'oui' : 'non'}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="estimation-valeur">{choisies.length}</span>
              <Meta>question{choisies.length === 1 ? '' : 's'}</Meta>
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {/*
               * Sans chronomètre, il n'y a pas de durée à estimer : « libre »
               * dit la vérité là où « 0 min » mentirait avec l'aplomb d'un
               * chiffre.
               */}
              <span className="estimation-valeur">
                {sansChronometre ? 'libre' : minutes === null ? '0 min' : `${minutes} min`}
              </span>
              <Meta>{sansChronometre ? 'durée' : 'estimées'}</Meta>
            </span>
          </div>
        </div>

        {vide ? (
          <div
            style={{
              marginTop: 'var(--air-bloc)',
              padding: '26px 24px',
              borderRadius: 'var(--radius-xl)',
              background: 'var(--surface-page)',
            }}
          >
            <Picto nom="question" taille={38} />
            <span
              style={{
                display: 'block',
                marginTop: 14,
                fontSize: 'var(--body-md-size)',
                fontWeight: 600,
                color: 'var(--text-heading)',
              }}
            >
              Aucune question retenue
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 8,
                fontSize: 'var(--body-sm-size)',
                lineHeight: 1.55,
                color: 'var(--neutral-70)',
              }}
            >
              Cochez des questions à gauche. Le numéro qui s’inscrit dans la case est leur rang
              de passage.
            </span>
          </div>
        ) : (
          <>
            <ul className="ordre-liste">
              {montrees.map((identifiant, index) => {
                const question = parId.get(identifiant);
                const formationId = question?.formationIds[0];
                const formation = formationId ? formationsParId.get(formationId) : undefined;
                const visuel = formation ? identiteVisuelle(formation) : null;
                const enonce = question?.enonce ?? 'Question retirée de la banque';

                return (
                  <li key={identifiant} className="ordre-ligne">
                    {/*
                     * **La poignée ne suffit pas, et c'est un ajout hors
                     * maquette.** Un glisser-déposer n'existe ni au clavier ni
                     * pour un lecteur d'écran. Deux boutons de déplacement
                     * portent donc la même action, annoncée en toutes lettres,
                     * et la poignée reste pour la souris.
                     */}
                    <span className="ordre-poignee" aria-hidden="true">
                      <Icone nom="deplacer" taille={16} />
                    </span>
                    <span className="ordre-rang" aria-hidden="true">
                      {index + 1}
                    </span>
                    {visuel && <FormeFormation fichier={visuel.fichier} taille={20} />}
                    <span className="ordre-enonce" title={enonce}>
                      {enonce}
                    </span>
                    <button
                      type="button"
                      className="ordre-poignee"
                      disabled={index === 0}
                      aria-label={`Avancer « ${enonce} » au rang ${index}`}
                      onClick={() => onDeplacer(identifiant, -1)}
                      style={{ opacity: index === 0 ? 0.3 : 1 }}
                    >
                      <Icone nom="chevronDown" taille={15} style={{ transform: 'rotate(180deg)' }} />
                    </button>
                    <button
                      type="button"
                      className="ordre-poignee"
                      disabled={index === montrees.length - 1 && reste === 0}
                      aria-label={`Reculer « ${enonce} » au rang ${index + 2}`}
                      onClick={() => onDeplacer(identifiant, 1)}
                      style={{
                        opacity: index === montrees.length - 1 && reste === 0 ? 0.3 : 1,
                      }}
                    >
                      <Icone nom="chevronDown" taille={15} />
                    </button>
                    <button
                      type="button"
                      className="ordre-retirer"
                      aria-label={`Retirer « ${enonce} » de la séance`}
                      onClick={() => onRetirer(identifiant)}
                    >
                      <Icone nom="close" taille={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {reste > 0 && (
              <Meta style={{ padding: '2px 14px', marginTop: 8, fontSize: 'var(--body-sm-size)' }}>
                et {reste} autre{reste > 1 ? 's' : ''} plus bas.
              </Meta>
            )}
          </>
        )}
      </div>

      <div className="panneau-actions">
        <Bouton
          taille="lg"
          pleineLargeur
          disabled={vide || enregistrement || titre.trim() === ''}
          iconeGauche={<Icone nom="play" taille={16} />}
          onClick={onLancer}
        >
          {enregistrement ? 'Enregistrement…' : 'Lancer la séance'}
        </Bouton>
        <Bouton
          variante="fantome"
          pleineLargeur
          disabled={vide || enregistrement || titre.trim() === ''}
          onClick={onEnregistrer}
        >
          {libelleEnregistrer}
        </Bouton>
      </div>
    </Carte>
  );
}

/* ------------------------------------------------------------- le chronomètre */

/**
 * Le temps laissé pour répondre.
 *
 * **« Sans » n'est plus une cadence, c'est une case à cocher.** La maquette
 * sépare les deux, et elle a raison : « ne pas chronométrer » n'est pas une
 * durée plus courte que vingt secondes, c'est un autre régime — on passe à la
 * suivante quand on le décide. Les cadences s'éteignent alors au lieu de
 * disparaître, pour qu'on voie ce qu'on retrouvera en décochant.
 */
function Chronometre({
  duree,
  onDuree,
  eteint,
  onEteindre,
}: {
  duree: number;
  onDuree: (valeur: number) => void;
  eteint: boolean;
  onEteindre: (valeur: boolean) => void;
}) {
  return (
    <div>
      <span
        style={{
          display: 'block',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
          marginBottom: 4,
        }}
        id="chrono-titre"
      >
        Temps par question
      </span>
      <span
        style={{
          display: 'block',
          fontSize: 'var(--body-xs-size)',
          color: 'var(--text-secondary)',
          marginBottom: 12,
        }}
      >
        {eteint
          ? 'Vous passez à la suivante quand vous le décidez.'
          : 'Les réponses se ferment à la fin du temps.'}
      </span>

      <div
        className="chrono-pilules"
        data-eteint={eteint ? 'oui' : 'non'}
        role="group"
        aria-labelledby="chrono-titre"
      >
        {CADENCES.map((valeur) => (
          <button
            key={valeur}
            type="button"
            className="chrono-pilule"
            aria-pressed={!eteint && valeur === duree}
            disabled={eteint}
            onClick={() => onDuree(valeur)}
          >
            {valeur} s
          </button>
        ))}
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          marginTop: 14,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={eteint}
          onChange={(evenement) => onEteindre(evenement.target.checked)}
          style={{
            width: 22,
            height: 22,
            flex: 'none',
            margin: 0,
            accentColor: 'var(--neutral-100)',
            cursor: 'pointer',
          }}
        />
        <span style={{ fontSize: 'var(--body-sm-size)', color: 'var(--text-body)' }}>
          Ne pas chronométrer cette séance
        </span>
      </label>
    </div>
  );
}
