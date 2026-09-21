'use client';

import { Bouton, Carte, EtiquetteStatut, Meta } from '@/composants/ds/primitives';
import { FormeFormation } from '@/composants/ds/parcours';
import { Icone } from '@/composants/ds/Icone';
import { identiteVisuelle } from '@/lib/formations/depot';
import type { Formation } from '@/lib/formations/depot';
import type { QuestionListee } from '@/lib/questions/lecture';
import type { LigneBilan, Session } from '@/lib/session/depot';
import { echecMoyen, lignesTrebuchees, SEUIL_GRAVE } from '@/lib/session/bilan';
import { dureeEcouleeMinutes, titreDeSeance } from '@/lib/session/seance';

/**
 * Ce qu'une séance passée a laissé.
 *
 * **Trois chiffres et une liste**, et rien d'autre : ce qui a été posé, ce qui
 * a trébuché, et de quoi le reposer. C'est l'écran que Noémie ouvre le mardi
 * pour préparer le jeudi suivant.
 *
 * **Aucun identifiant nulle part.** Le bilan porte deux compteurs par
 * question — combien de réponses, combien d'échecs — et le compte des
 * présents. La liste nominative s'est éteinte avec la séance ; ce panneau lit
 * ce qui reste, et ce qui reste est anonyme par construction.
 *
 * **Le même composant sert de panneau et d'écran.** À 1440 il vit à droite de
 * la liste des séances ; en dessous, la maquette en fait une vue à part
 * entière, atteinte par la ligne de la liste. Seule la densité change.
 */

export function DetailSeancePassee({
  seance,
  bilan,
  questions,
  formations,
  compact = false,
  className,
  onReprendreLesRatees,
}: {
  seance: Session;
  /** `null` tant que le bilan n'est pas lu ; vide s'il n'y en a pas. */
  bilan: LigneBilan[] | null;
  questions: QuestionListee[];
  formations: Formation[];
  /** Vrai sur un écran étroit : quatre lignes au lieu de cinq. */
  compact?: boolean;
  className?: string;
  onReprendreLesRatees: (questionIds: string[]) => void;
}) {
  const lignes = bilan ? lignesTrebuchees(bilan, questions, formations) : [];
  const moyen = bilan ? echecMoyen(bilan) : null;
  const ecoulees = dureeEcouleeMinutes(seance);
  const montrees = lignes.slice(0, compact ? 4 : 5);

  /*
   * « Reprendre les ratées » ne reprend que ce qui a vraiment trébuché.
   * Au-dessus du seuil, et dans l'ordre où l'écran les montre.
   */
  const ratees = lignes.filter((ligne) => ligne.tauxEchec >= SEUIL_GRAVE);

  const chiffres: [string, string][] = [
    [
      String(seance.questionIds.length),
      seance.questionIds.length > 1 ? 'questions' : 'question',
    ],
    ...(moyen === null ? [] : ([[`${moyen} %`, 'd’échec moyen']] as [string, string][])),
    ...(compact
      ? ([[String(seance.presentsFinal), 'présents']] as [string, string][])
      : ecoulees === null
        ? []
        : ([[`${ecoulees} min`, 'écoulées']] as [string, string][])),
  ];

  return (
    <Carte
      className={className}
      rayon="var(--radius-2xl)"
      rembourrage={compact ? '22px 22px' : '32px 32px 28px'}
      style={{ alignSelf: 'start', boxSizing: 'border-box' }}
    >
      <div style={{ flex: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <EtiquetteStatut ton={seance.statut === 'abandonnee' ? 'attention' : 'brouillon'}>
            {seance.statut === 'abandonnee' ? 'Abandonnée' : 'Séance passée'}
          </EtiquetteStatut>
          <Meta style={{ fontSize: 13 }}>
            {dateCourte(seance.termineeLeMs ?? seance.creeeLeMs)}
            {seance.effectifAttendu > 0
              ? `, ${seance.presentsFinal} présents sur ${seance.effectifAttendu}`
              : `, ${seance.presentsFinal} présent${seance.presentsFinal > 1 ? 's' : ''}`}
          </Meta>
        </span>

        <span
          style={{
            display: 'block',
            marginTop: 16,
            fontFamily: 'var(--font-display)',
            fontSize: compact ? 22 : 26,
            lineHeight: 1.18,
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          {titreDeSeance(seance)}
        </span>

        <div className="detail-chiffres">
          {chiffres.map(([valeur, libelle]) => (
            <span key={libelle}>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-display)',
                  fontSize: 24,
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
      </div>

      <div className="detail-trebuche">
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flex: 'none' }}>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--text-heading)',
            }}
          >
            Ce qui a le plus trébuché
          </h3>
          <Meta style={{ fontSize: 13, marginLeft: 'auto' }}>taux d’échec</Meta>
        </span>

        {bilan === null ? (
          <Meta style={{ marginTop: 'var(--air-bloc)', fontSize: 'var(--body-sm-size)' }}>
            Lecture du bilan…
          </Meta>
        ) : montrees.length === 0 ? (
          <Meta style={{ marginTop: 'var(--air-bloc)', fontSize: 'var(--body-sm-size)' }}>
            Aucune réponse n’a été enregistrée : il n’y a rien à reprendre.
          </Meta>
        ) : (
          <ul className="detail-liste">
            {montrees.map((ligne) => {
              const grave = ligne.tauxEchec >= SEUIL_GRAVE;
              const visuel = ligne.formation ? identiteVisuelle(ligne.formation) : null;
              return (
                <li
                  key={ligne.questionId}
                  className="detail-ligne"
                  data-grave={grave ? 'oui' : 'non'}
                >
                  {visuel && (
                    <span style={{ marginTop: 2 }}>
                      <FormeFormation fichier={visuel.fichier} taille={20} />
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--body-sm-size)',
                        lineHeight: 1.45,
                        color: 'var(--text-body)',
                        textWrap: 'pretty',
                      }}
                    >
                      {ligne.enonce}
                    </span>
                    <Meta style={{ display: 'block', marginTop: 5, fontSize: 13 }}>
                      {ligne.type}
                    </Meta>
                  </span>
                  <span className="detail-taux">{ligne.tauxEchec} %</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="detail-action preparer-action-carte">
        <Bouton
          disabled={ratees.length === 0}
          iconeGauche={<Icone nom="copy" taille={15} />}
          onClick={() => onReprendreLesRatees(ratees.map((ligne) => ligne.questionId))}
          style={{ whiteSpace: 'nowrap' }}
        >
          {compact ? 'Reprendre les ratées' : 'Reprendre les ratées dans une séance'}
        </Bouton>
      </div>
    </Carte>
  );
}

/** « Jeudi 12 mars ». Le jour de la semaine compte : la séance est un rituel. */
export function dateCourte(millisecondes: number | null): string {
  if (millisecondes === null) return 'date inconnue';
  const texte = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(millisecondes));
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
