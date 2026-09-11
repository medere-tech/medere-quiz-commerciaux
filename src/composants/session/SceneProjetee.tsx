'use client';

import { Bouton } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { ArreterSeance } from '@/composants/session/ArreterSeance';
import { Chronometre } from '@/composants/session/Chronometre';
import { LIBELLES_TYPE } from '@/lib/questions/modele';
import type { Question } from '@/lib/questions/depot';
import { partDesRepondants } from '@/lib/session/repartition';

/**
 * La scène : ce qui est projeté sur le mur.
 *
 * **Elle ne connaît que ses données.** C'est ce qui la rend vérifiable : un
 * écran qu'on ne peut regarder qu'en séance réelle est un écran qu'on ne
 * regarde jamais. Séparée de l'écoute Firestore, elle se rend avec un jeu
 * d'essai — mise en situation à contexte long, dix noms, options à rallonge —
 * et se capture à 1920 pixels sans ouvrir de séance.
 *
 * **Ce n'est pas un écran de bureau.** Dix personnes la lisent à plusieurs
 * mètres. La question monte à 56 pixels, les options à 26, sur le fond encre de
 * la marque. Les tailles viennent de la distance de lecture, pas de l'échelle
 * typographique — c'est le seul endroit de l'outil où cet arbitrage se pose.
 *
 * **Le code reste affiché toute la séance.** Un retardataire arrive au milieu,
 * quelqu'un rejoint depuis son téléphone : le code doit être lisible du fond de
 * la salle à n'importe quel moment, pas seulement à l'ouverture.
 */

export type VueScene = {
  code: string;
  numero: number;
  total: number;
  question: Question | null;
  revelee: boolean;
  enPause: boolean;
  /** Un compte par option, dans l'ordre d'affichage. */
  comptes: number[];
  reponsesRecues: number;
  participants: number;
  questionOuverteLeMs: number | null;
  dureeQuestionSecondes: number;
};

const SUR_ENCRE = 'rgba(255,255,255,0.72)';

export function SceneProjetee({
  vue,
  onReveler,
  onSuivante,
  onRejouer,
  onPause,
  onReprendre,
  onTerminer,
  onAbandonner,
  dernier,
}: {
  vue: VueScene;
  onReveler: () => void;
  onSuivante: () => void;
  onRejouer: () => void;
  onPause: () => void;
  onReprendre: () => void;
  onTerminer: () => void;
  onAbandonner: () => void;
  dernier: boolean;
}) {
  const { question } = vue;

  return (
    <div className="session-scene">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          flex: 'none',
        }}
      >
        {/* Le code, toujours là, toujours lisible de loin. */}
        <span
          style={{
            padding: '8px 18px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.14)',
            color: '#fff',
            fontSize: 'clamp(18px, 1.9vw, 26px)',
            fontWeight: 700,
            letterSpacing: '0.16em',
            whiteSpace: 'nowrap',
          }}
        >
          {vue.code}
        </span>
        <span style={{ fontSize: 'clamp(15px, 1.4vw, 20px)', color: SUR_ENCRE }}>
          Question {vue.numero} sur {vue.total}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-5)',
            flexWrap: 'wrap',
          }}
        >
          {/*
           * Le décompte s'arrête avec la séance.
           *
           * Le laisser courir pendant une pause afficherait « temps écoulé » au
           * retour, alors que la reprise redonne son temps à la salle. Révélée
           * ou suspendue, la question n'a plus d'échéance à montrer.
           */}
          <Chronometre
            ouverteLeMs={vue.questionOuverteLeMs}
            dureeSecondes={vue.revelee || vue.enPause ? 0 : vue.dureeQuestionSecondes}
            clair
          />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.10)',
              fontSize: 'clamp(15px, 1.4vw, 20px)',
              color: '#fff',
              whiteSpace: 'nowrap',
            }}
          >
            <Icone nom="users" taille={18} />
            {vue.reponsesRecues} sur {vue.participants || '—'}
          </span>
        </span>
      </div>

      {/*
       * Le corps peut défiler, la barre de commandes non.
       *
       * Une mise en situation porte plusieurs lignes de contexte avant quatre
       * options longues : sans cette contrainte, le contenu pousserait les
       * boutons hors de l'écran, et l'animatrice n'aurait plus de quoi révéler.
       */}
      <div className="session-corps">
        {question ? (
          <>
            <span
              style={{
                display: 'inline-block',
                padding: '5px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,255,255,0.12)',
                fontSize: 'clamp(11px, 1.1vw, 15px)',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.9)',
              }}
            >
              {LIBELLES_TYPE[question.type]}
            </span>

            {/*
             * Le contexte d'une mise en situation est la moitié de la question :
             * sans lui, la salle ne peut pas répondre. La maquette ne le montre
             * pas — elle illustre un choix multiple — mais l'omettre rendrait
             * un format entier inutilisable en séance.
             */}
            {question.contexte && (
              <p
                style={{
                  margin: 'clamp(12px, 1.4vw, 18px) 0 0',
                  fontSize: 'clamp(15px, 1.5vw, 22px)',
                  lineHeight: 1.5,
                  color: SUR_ENCRE,
                  textWrap: 'pretty',
                }}
              >
                {question.contexte}
              </p>
            )}

            <h1
              style={{
                margin: 'clamp(12px, 1.5vw, 20px) 0 0',
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: question.contexte
                  ? 'clamp(23px, 2.8vw, 42px)'
                  : 'clamp(26px, 3.6vw, 56px)',
                lineHeight: 1.1,
                color: '#fff',
                textWrap: 'pretty',
              }}
            >
              {question.enonce}
            </h1>

            <div className="session-options">
              {question.ordreOptions.map((identifiant, index) => {
                const compte = vue.comptes[index] ?? 0;
                // Part des répondants, pas part de la somme des choix : sur un
                // QCM multiple, la somme dépasse le nombre de personnes.
                const part = partDesRepondants(compte, vue.reponsesRecues);
                const juste = question.bonnesReponses.includes(identifiant);

                return (
                  <div
                    key={identifiant}
                    style={{
                      position: 'relative',
                      borderRadius: 'var(--radius-lg)',
                      background: 'rgba(255,255,255,0.07)',
                      border:
                        '1px solid ' +
                        (vue.revelee && juste
                          ? 'var(--status-success)'
                          : 'rgba(255,255,255,0.16)'),
                      overflow: 'hidden',
                    }}
                  >
                    {/*
                     * La barre n'apparaît qu'à la révélation. La faire monter
                     * pendant le vote dirait aux derniers ce que les premiers
                     * ont voté — et la séance perdrait son intérêt.
                     */}
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: vue.revelee ? `${part}%` : 0,
                        background: juste ? 'rgba(45,161,49,0.34)' : 'rgba(255,255,255,0.10)',
                        transition: 'width var(--duration-slow) var(--ease-out)',
                      }}
                    />
                    <span
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-4)',
                        padding: 'clamp(11px, 1.2vw, 18px) clamp(14px, 1.5vw, 22px)',
                      }}
                    >
                      <span
                        style={{
                          width: 'clamp(28px, 2.2vw, 36px)',
                          height: 'clamp(28px, 2.2vw, 36px)',
                          flex: 'none',
                          borderRadius: 999,
                          background:
                            vue.revelee && juste
                              ? 'var(--status-success)'
                              : 'rgba(255,255,255,0.16)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 'clamp(14px, 1.3vw, 18px)',
                          fontWeight: 700,
                        }}
                      >
                        {vue.revelee && juste ? (
                          <Icone nom="check" taille={18} />
                        ) : (
                          String.fromCharCode(65 + index)
                        )}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 'clamp(15px, 1.6vw, 26px)',
                          lineHeight: 1.3,
                          color: '#fff',
                          textWrap: 'pretty',
                        }}
                      >
                        {question.options[identifiant]}
                      </span>
                      {vue.revelee && (
                        <span
                          style={{
                            flex: 'none',
                            fontSize: 'clamp(15px, 1.5vw, 24px)',
                            fontWeight: 600,
                            color: juste ? '#fff' : 'rgba(255,255,255,0.7)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {part} %
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 'clamp(16px, 1.6vw, 22px)', color: SUR_ENCRE }}>
            Cette question n’est plus publiée. Passez à la suivante.
          </p>
        )}
      </div>

      <div className="session-commandes">
        {vue.enPause ? (
          /*
           * En pause, une seule action met en avant : reprendre. Le reste
           * disparaît — une animatrice qui revient d'une interruption ne doit
           * pas avoir à choisir entre cinq boutons.
           */
          <>
            <Bouton taille="lg" variante="soulignee" onClick={onReprendre}>
              Reprendre la séance
            </Bouton>
            <ArreterSeance
              onTerminer={onTerminer}
              onAbandonner={onAbandonner}
              questionsJouees={vue.numero}
              questionsTotal={vue.total}
            />
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 'clamp(14px, 1.3vw, 19px)',
                color: SUR_ENCRE,
              }}
            >
              Séance suspendue · le vote est fermé
            </span>
          </>
        ) : vue.revelee ? (
          <>
            <Bouton taille="lg" variante="soulignee" onClick={onSuivante}>
              {dernier ? 'Terminer et classer' : 'Question suivante'}
            </Bouton>
            {/*
              * La variante inverse est encre sur encre : sur ce fond, elle
              * disparaît. Une bordure complète la rend visible sans en faire
              * une action principale — c'est bien « Question suivante » qu'on
              * cherche du regard.
              */}
            <Bouton
              taille="lg"
              variante="inverse"
              onClick={onRejouer}
              style={{ border: '1px solid rgba(255,255,255,0.32)' }}
            >
              Rejouer le vote
            </Bouton>
            <Bouton taille="lg" variante="fantome" onClick={onPause} style={{ color: '#fff' }}>
              Pause
            </Bouton>
            <ArreterSeance
              onTerminer={onTerminer}
              onAbandonner={onAbandonner}
              questionsJouees={vue.numero}
              questionsTotal={vue.total}
            />
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 'clamp(14px, 1.3vw, 19px)',
                color: SUR_ENCRE,
              }}
            >
              Bonne réponse révélée
            </span>
          </>
        ) : (
          <>
            <Bouton taille="lg" variante="soulignee" onClick={onReveler}>
              Révéler la bonne réponse
            </Bouton>
            <Bouton taille="lg" variante="fantome" onClick={onPause} style={{ color: '#fff' }}>
              Pause
            </Bouton>
            <ArreterSeance
              onTerminer={onTerminer}
              onAbandonner={onAbandonner}
              questionsJouees={vue.numero}
              questionsTotal={vue.total}
            />
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 'clamp(14px, 1.3vw, 19px)',
                color: SUR_ENCRE,
              }}
            >
              {vue.reponsesRecues} réponse{vue.reponsesRecues > 1 ? 's' : ''} reçue
              {vue.reponsesRecues > 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
