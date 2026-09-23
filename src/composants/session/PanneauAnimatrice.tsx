'use client';

import { Bouton, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Pastille } from '@/composants/session/Pastille';
import type { Question } from '@/lib/questions/depot';
import { AppelsALaPorte } from '@/composants/session/AppelsALaPorte';
import type { Appel, Participant, ReponseSession } from '@/lib/session/depot';

/**
 * Le panneau de l'animatrice, à côté de la scène.
 *
 * **La seule vue nominative de tout l'outil.** Les règles réservent la lecture
 * des réponses de séance à l'animatrice — décision assumée du lot 1 : c'est
 * l'intérêt même de l'exercice collectif, et les participants étaient dans la
 * même pièce. Partout ailleurs, personne ne voit qui a raté quoi.
 *
 * **Ce panneau n'est pas privé, et le croire serait une faute.** Il a
 * longtemps porté ici l'affirmation inverse — « elle lit ce panneau sur son
 * propre écran, pas sur le mur ». C'est faux à deux titres : le panneau et la
 * scène sont deux éléments d'une même boîte flexible, dans une même fenêtre ;
 * et une séance hybride se partage par visioconférence, donc **tout ce que
 * Noémie voit, la salle et les participants à distance le voient aussi**.
 *
 * Ce qui reste vrai : c'est le **moins exposé des deux**, parce qu'il n'est pas
 * dessiné pour la distance. D'où des tailles ordinaires ici, quand la scène
 * vise plusieurs mètres. Un nom de trente-deux caractères y tient sans pousser
 * la lettre choisie hors du cadre : c'est la borne, et elle a été essayée.
 *
 * **Conséquence pratique, et elle vaut pour tout ajout ici :** écrire ce
 * panneau comme s'il allait être lu par la salle. Bref, sans détail inutile,
 * et effacé dès que l'action est faite.
 */
export function PanneauAnimatrice({
  participants,
  reponses,
  question,
  revelee,
  appels,
  verrouillee,
  onVerrouiller,
  onEcarterAppel,
}: {
  /** Ceux qui ont trouvé porte close et l'ont signalé. */
  appels: Appel[];
  /** L'état de la porte, et de quoi en changer. */
  verrouillee: boolean;
  onVerrouiller: (verrouillee: boolean) => void;
  onEcarterAppel: (uid: string) => void;
  participants: Participant[];
  /** Réponses de la question en cours, uniquement. */
  reponses: ReponseSession[];
  question: Question | null;
  revelee: boolean;
}) {
  return (
    <aside className="session-panneau">
      {/*
        * **En tête du panneau, avant la liste des présents.** Ceux qui sont
        * dedans n'attendent rien ; celui qui est dehors, si — et c'est le seul
        * élément de cet écran qui appelle une décision. Le bloc disparaît dès
        * qu'elle ouvre ou qu'elle écarte.
        */}
      <AppelsALaPorte
        appels={appels}
        presentation="panneau"
        verrouillee={verrouillee}
        onOuvrir={() => onVerrouiller(false)}
        onEcarter={onEcarterAppel}
      />

      {/*
        * **La porte, et elle manquait entièrement.**
        *
        * Noémie ferme l'accès dans la salle d'attente, puis lance la séance —
        * et l'écran de séance ne portait aucune commande de verrou. Elle
        * n'avait plus aucun moyen de rouvrir, sauf arrêter la séance. Un
        * retardataire qui prévient n'aurait servi à rien : la réponse
        * n'existait pas.
        *
        * Elle vit ici, et non sur la scène : la scène s'adresse à la salle,
        * pas à l'animatrice.
        */}
      <span
        style={{
          marginTop: appels.length > 0 ? 'var(--space-4)' : 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <Meta style={{ fontSize: 12 }}>
          {verrouillee ? 'Accès fermé' : 'Accès ouvert'}
        </Meta>
        <Bouton
          taille="sm"
          variante="fantome"
          onClick={() => onVerrouiller(!verrouillee)}
          style={{ marginLeft: 'auto' }}
        >
          {verrouillee ? 'Ouvrir' : 'Fermer'}
        </Bouton>
      </span>

      <span
        style={{
          marginTop: 'var(--space-4)',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
        }}
      >
        Participants
      </span>
      <Meta style={{ fontSize: 12 }}>
        {reponses.length} sur {participants.length} ont répondu
      </Meta>

      <div
        style={{
          marginTop: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {participants.length === 0 && (
          <Meta style={{ fontSize: 12 }}>Personne n’a encore rejoint la séance.</Meta>
        )}

        {participants.map((participant) => {
          const sienne = reponses.find((reponse) => reponse.uid === participant.uid);
          const lettres = sienne
            ? (question?.ordreOptions ?? [])
                .map((identifiant, index) =>
                  sienne.optionsChoisies.includes(identifiant)
                    ? String.fromCharCode(65 + index)
                    : null,
                )
                .filter(Boolean)
                .join(' ')
            : null;

          return (
            <span
              key={participant.uid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background:
                  sienne == null
                    ? 'var(--surface-page)'
                    : sienne.correcte
                      ? 'rgba(45,161,49,0.09)'
                      : 'rgba(194,66,66,0.07)',
              }}
            >
              {/* La pastille dit qui, la coche dit quoi : deux informations,
                  deux repères, jamais l'un à la place de l'autre. */}
              <Pastille nom={participant.nom} avatar={participant.avatar} taille={26} />

              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  flex: 'none',
                  borderRadius: 999,
                  background:
                    sienne == null
                      ? 'var(--neutral-30)'
                      : sienne.correcte
                        ? 'var(--status-success)'
                        : 'var(--status-danger)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sienne && <Icone nom={sienne.correcte ? 'check' : 'close'} taille={11} />}
              </span>

              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--body-sm-size)',
                  color: sienne == null ? 'var(--text-secondary)' : 'var(--text-body)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={participant.nom}
              >
                {participant.nom}
              </span>

              <span
                style={{
                  flex: 'none',
                  fontSize: 12,
                  fontWeight: sienne ? 600 : 400,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {sienne == null ? 'en attente' : lettres}
              </span>
            </span>
          );
        })}
      </div>

      {revelee && question && (
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-5)', flex: 'none' }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--space-3)',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 'var(--body-sm-size)',
                fontWeight: 600,
                color: 'var(--text-heading)',
              }}
            >
              Explication
            </span>
            {/*
             * Le moment où l'on découvre qu'une explication est mauvaise, c'est
             * devant la salle. C'est aussi le seul moment où l'on sait quoi
             * corriger — et il n'existait aucun chemin d'ici vers l'éditeur.
             *
             * Nouvel onglet : la séance ne s'interrompt pas pour une correction.
             */}
            <a
              href={`/admin/questions/${question.id}`}
              target="_blank"
              rel="noopener"
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-link)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Modifier la question
            </a>
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--body-sm-size)',
              lineHeight: 1.55,
              color: 'var(--neutral-70)',
              textWrap: 'pretty',
            }}
          >
            {question.explication}
          </p>
        </div>
      )}
    </aside>
  );
}
