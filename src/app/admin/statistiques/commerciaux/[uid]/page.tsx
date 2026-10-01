import type { Route } from 'next';
import type { CSSProperties } from 'react';

import { RetourStatistiques } from '@/composants/admin/RetourStatistiques';
import { EtatVide } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { FormeFormation, Jauge } from '@/composants/ds/parcours';
import { Bouton, Carte, TitreSection } from '@/composants/ds/primitives';
import { Pastille } from '@/composants/session/Pastille';
import { lireSession } from '@/lib/auth/session-serveur';
import { chargerSuiviCommercial, type SuiviCommercial } from '@/lib/serveur/maitrise-equipe';

import { QuestionsDuCommercial, type LigneSuivie } from './QuestionsDuCommercial';

/**
 * Le suivi d'un commercial, pour l'équipe pédagogique.
 *
 * **Conforme à la maquette `screens-person.jsx`** (PersonDetail, 1024, 375) :
 * l'en-tête et sa dernière activité, quatre chiffres, la maîtrise par
 * formation — la plus faible en premier, c'est là que se trouve
 * l'accompagnement — et la liste de ses questions.
 *
 * On y arrive depuis le bloc « Maîtrise par commercial » des statistiques. Les
 * données viennent de `maitrise-equipe.ts`, derrière `exigerAdmin` : le SDK
 * Admin lit ce que les règles ferment à tout autre client que le commercial.
 *
 * **Deux écarts à la maquette, faute de donnée — signalés, pas inventés :**
 *
 * - « 4 ce mois-ci » sous les séries terminées : aucun compte par mois n'est
 *   tenu. On affiche les jours actifs de la semaine, que l'assiduité tient.
 * - « Juste 2 fois de suite, acquise le… » : la maîtrise retient la dernière
 *   tentative, pas une série de réussites ni une date d'acquisition. On dit
 *   combien de fois elle a été juste, et quand elle a été vue en dernier.
 */

type Parametres = { params: Promise<{ uid: string }> };

const HEURE = new Intl.DateTimeFormat('fr-FR', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});
const JOUR = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
});
const CLE_JOUR = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' });

/** « hier à 18 h 40 », « aujourd'hui à 9 h 05 », « le 26 septembre à 18 h 40 ». */
function quand(ms: number): string {
  const instant = new Date(ms);
  const heure = HEURE.format(instant).replace(':', ' h ');
  const jour = CLE_JOUR.format(instant);
  const aujourdhui = CLE_JOUR.format(new Date());
  const hier = CLE_JOUR.format(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (jour === aujourdhui) return `aujourd’hui à ${heure}`;
  if (jour === hier) return `hier à ${heure}`;
  return `le ${JOUR.format(instant)} à ${heure}`;
}

const pluriel = (nombre: number, mot: string) => `${mot}${nombre > 1 ? 's' : ''}`;

export default async function PageSuiviCommercial({ params }: Parametres) {
  // Pas d'administrateur connecté : la disposition rend la connexion ou le
  // refus, et ce que cette page renvoie est écarté. On ne lit rien.
  const session = await lireSession();
  if (!session?.admin) return null;

  const { uid } = await params;
  const suivi = await chargerSuiviCommercial(uid);

  if (!suivi) {
    return (
      <div className="page-admin">
        <RetourStatistiques />
        <EtatVide
          icone="users"
          titre="Ce compte n’est pas suivi"
          texte="L’adresse ne désigne aucun commercial connecté, ou ce compte appartient à l’équipe pédagogique, dont la maîtrise n’est pas suivie."
          actions={<Bouton href={'/admin/statistiques' as Route}>Retour aux statistiques</Bouton>}
        />
      </div>
    );
  }

  const lignes: LigneSuivie[] = suivi.questions.map((question) => ({
    questionId: question.questionId,
    enonce: question.enonce,
    formationId: question.formationId,
    formationNom: question.formationNom,
    formationFichier: question.formationFichier,
    tentatives: question.etat.tentatives,
    reussies: question.etat.reussies,
    etat: !question.etat.dejaVue ? 'jamais' : question.etat.derniereRatee ? 'ratee' : 'acquise',
    vueLeMs: question.etat.vueLeMs,
  }));
  const servies = suivi.maitrise.total;

  return (
    <div className="page-admin page-suivi">
      <div className="suivi-entete">
        <RetourStatistiques />
        <EnTete suivi={suivi} />
      </div>

      <Chiffres suivi={suivi} />

      <div className="suivi-grille">
        <section className="colonne-collante">
          <div className="suivi-etroit suivi-titre-hors-carte">
            <TitreSection indice="la plus faible d’abord">Par formation</TitreSection>
          </div>
          <Carte
            rayon="var(--suivi-carte-rayon)"
            rembourrage="var(--suivi-carte-rembourrage)"
            className="suivi-carte-formations"
          >
            <div className="suivi-large">
              <TitreSection>Maîtrise par formation</TitreSection>
              <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                La plus faible en premier.
              </p>
            </div>
            <div className="suivi-moyen">
              <TitreSection indice="la plus faible en premier">Maîtrise par formation</TitreSection>
            </div>
            <ParFormation lignes={suivi.parFormation} />
          </Carte>
        </section>

        <section style={{ minWidth: 0 }}>
          <div className="suivi-large">
            <TitreSection indice={`${servies} ${pluriel(servies, 'servie')} à ce commercial`}>
              Questions
            </TitreSection>
          </div>
          <div className="suivi-pas-large">
            <TitreSection indice={`${servies} ${pluriel(servies, 'servie')}`}>Questions</TitreSection>
          </div>
          <QuestionsDuCommercial lignes={lignes} ordreFormations={suivi.parFormation.map((ligne) => ligne.formationId)} />
        </section>
      </div>
    </div>
  );
}

function EnTete({ suivi }: { suivi: SuiviCommercial }) {
  const activite = suivi.derniereActiviteMs;
  return (
    <div className="suivi-personne">
      <span className="suivi-pastille">
        <Pastille nom={suivi.nom} avatar={suivi.avatar} taille="var(--suivi-pastille)" />
      </span>
      <div style={{ minWidth: 0 }}>
        <h1 className="suivi-nom">{suivi.nom}</h1>
        <span className="suivi-activite">
          <span className="suivi-pas-etroit">
            <Icone nom="clock" taille={15} />
            {activite === null ? 'Aucune activité pour l’instant' : `Dernière activité ${quand(activite)}`}
          </span>
          <span className="suivi-etroit">
            {activite === null ? 'Aucune activité pour l’instant' : `Actif ${quand(activite)}`}
          </span>
        </span>
      </div>
    </div>
  );
}

function Chiffres({ suivi }: { suivi: SuiviCommercial }) {
  const faible = suivi.maitrise.pourcentage < 50;
  const chiffres: [string, string, string][] = [
    [`${suivi.maitrise.pourcentage} %`, 'maîtrise globale', `équipe : ${suivi.maitriseEquipe} %`],
    [String(suivi.vues), `${pluriel(suivi.vues, 'question')} ${pluriel(suivi.vues, 'vue')}`, `sur ${suivi.maitrise.total} ${pluriel(suivi.maitrise.total, 'servie')}`],
    [
      String(suivi.aRevoir),
      'à revoir',
      `${suivi.rateesPlusieursFois} ${pluriel(suivi.rateesPlusieursFois, 'ratée')} plusieurs fois`,
    ],
    [
      String(suivi.seriesTerminees),
      `${pluriel(suivi.seriesTerminees, 'série')} ${pluriel(suivi.seriesTerminees, 'terminée')}`,
      `${suivi.joursActifsCetteSemaine} ${pluriel(suivi.joursActifsCetteSemaine, 'jour')} ${pluriel(suivi.joursActifsCetteSemaine, 'actif')} cette semaine`,
    ],
  ];

  return (
    <div className="suivi-chiffres">
      {chiffres.map(([valeur, libelle, detail], index) => (
        <Carte
          key={libelle}
          rayon="var(--radius-xl)"
          rembourrage="var(--suivi-chiffre-rembourrage)"
          elevation={index === 0 ? 'carte' : 'petite'}
        >
          <span
            className="suivi-chiffre"
            style={{ color: index === 0 && faible ? 'var(--status-danger-texte)' : 'var(--text-heading)' }}
          >
            {valeur}
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 10,
              fontSize: 'var(--body-sm-size)',
              fontWeight: 600,
              color: 'var(--text-heading)',
            }}
          >
            {libelle}
          </span>
          <span style={{ display: 'block', marginTop: 3, fontSize: 13, color: 'var(--text-secondary)' }}>
            {detail}
          </span>
        </Carte>
      ))}
    </div>
  );
}

/**
 * La maîtrise par formation, la plus faible en premier. Teintes de la
 * maquette : sous 50 %, l'alerte ; sous 65 %, l'avertissement ; au-dessus,
 * l'encre.
 */
function ParFormation({ lignes }: { lignes: SuiviCommercial['parFormation'] }) {
  if (lignes.length === 0) {
    return (
      <p className="suivi-formations-liste" style={{ margin: 0, fontSize: 'var(--body-sm-size)', color: 'var(--text-secondary)' }}>
        Aucune formation n’a de question servie.
      </p>
    );
  }

  return (
    <div
      className="suivi-formations-liste"
      style={{ '--lignes': Math.ceil(lignes.length / 2) } as CSSProperties}
    >
      {lignes.map((ligne, index) => {
        const { pourcentage, maitrisees, total } = ligne.maitrise;
        const faible = pourcentage < 50;
        return (
          <div key={ligne.formationId} style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            {ligne.fichier && (
              <span className="suivi-forme">
                <FormeFormation fichier={ligne.fichier} taille={24} />
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span
                  className="suivi-formation-nom"
                  title={ligne.nom}
                  style={{ fontWeight: index === 0 ? 600 : 500 }}
                >
                  {ligne.nom}
                </span>
                <span
                  style={{
                    flex: 'none',
                    fontSize: 'var(--body-sm-size)',
                    fontWeight: 700,
                    color: faible ? 'var(--status-danger-texte)' : 'var(--text-heading)',
                  }}
                >
                  {pourcentage} %
                </span>
              </span>
              <span style={{ display: 'block', marginTop: 8 }}>
                <Jauge
                  valeur={pourcentage}
                  hauteur={6}
                  ton={
                    faible
                      ? 'var(--status-danger)'
                      : pourcentage < 65
                        ? 'var(--status-warning)'
                        : 'var(--neutral-100)'
                  }
                />
              </span>
              <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                {maitrisees} {pluriel(maitrisees, 'question')} {pluriel(maitrisees, 'acquise')} sur {total}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
