'use client';

import type { Route } from 'next';
import { useEffect, useState } from 'react';

import { Bouton, Carte } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Picto } from '@/composants/ds/Picto';
import { prochaineSeance, seanceOuverte, type Session } from '@/lib/session/depot';
import { titreDeSeance } from '@/lib/session/seance';

/**
 * La carte de séance collective, à droite de l'accueil.
 *
 * **Le geste que ça supprime.** Sans cette carte, rejoindre une séance demande
 * d'ouvrir l'application, d'aller sur « Session du jeudi » et de saisir un
 * code. Pour les participants en visioconférence, qui entendent la salle avec
 * du retard et parfois mal, c'est le point de friction de chaque jeudi. Ici, il
 * n'y a qu'à cliquer.
 *
 * **Elle ne disparaît plus.** Elle ne s'affichait qu'en séance ouverte : le
 * reste de la semaine, la colonne de droite était vide et l'accueil changeait
 * de forme selon le jour. Une carte qui apparaît et disparaît n'apprend à
 * personne où regarder. Elle montre donc, dans l'ordre : la séance en cours,
 * sinon la prochaine préparée, sinon qu'il n'y en a pas.
 *
 * **Et l'action dit ce qu'elle fait.** « Rejoindre la séance » n'a de sens que
 * sur une salle ouverte ; sur une séance qui n'a pas commencé, le bouton mène
 * à la section, sans rien promettre.
 *
 * Une séance en pause n'est pas annoncée comme ouverte : inviter à rejoindre un
 * écran qui dit « en pause » serait une promesse déçue. Elle le sera à la
 * reprise.
 */
type Etat =
  | { quoi: 'chargement' }
  | { quoi: 'ouverte'; seance: Session }
  | { quoi: 'prevue'; seance: Session }
  | { quoi: 'aucune' };

export function BandeauSeance() {
  const [etat, setEtat] = useState<Etat>({ quoi: 'chargement' });

  useEffect(() => {
    let vivant = true;

    /*
     * Une lecture au montage, pas un écouteur : une carte qui change au milieu
     * d'une lecture d'accueil déplacerait le contenu sous les doigts.
     *
     * La séance en cours d'abord ; la prochaine n'est demandée que si la
     * première ne donne rien. Le jeudi, c'est une lecture, pas deux.
     */
    void (async () => {
      try {
        const ouverte = await seanceOuverte();
        if (!vivant) return;
        if (ouverte) {
          setEtat({ quoi: 'ouverte', seance: ouverte });
          return;
        }

        const prevue = await prochaineSeance();
        if (!vivant) return;
        setEtat(prevue ? { quoi: 'prevue', seance: prevue } : { quoi: 'aucune' });
      } catch {
        // Une carte qui dit « aucune séance » plutôt qu'un accueil cassé : la
        // saisie du code reste disponible depuis la section.
        if (vivant) setEtat({ quoi: 'aucune' });
      }
    })();

    return () => {
      vivant = false;
    };
  }, []);

  // Le temps de la lecture, la carte garde sa place : la remplir ensuite ne
  // doit pas pousser le reste de l'accueil vers le bas.
  if (etat.quoi === 'chargement') return <div className="bandeau-seance-reserve" aria-hidden />;

  const surtitre = etat.quoi === 'ouverte' ? 'Séance en cours' : 'Séance collective';
  const titre =
    etat.quoi === 'aucune' ? 'Aucune séance programmée' : titreDeSeance(etat.seance);

  return (
    <Carte
      rayon="var(--radius-xl)"
      rembourrage="20px 22px"
      elevation="carte"
      className="bandeau-seance"
      style={{ background: 'var(--surface-inverse)' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Picto nom="professions" taille={28} ton="blanc" />
        <span style={{ fontSize: 'var(--body-sm-size)', color: 'rgba(255, 255, 255, 0.7)' }}>
          {surtitre}
        </span>
      </span>

      <span className="bandeau-seance-titre">{titre}</span>

      <p className="bandeau-seance-detail">{detail(etat)}</p>

      <Bouton
        taille="sm"
        variante="secondaire"
        pleineLargeur
        href={'/session' as Route}
        iconeGauche={<Icone nom="users" taille={15} />}
      >
        {etat.quoi === 'ouverte' ? 'Rejoindre la séance' : 'Session du jeudi'}
      </Bouton>
    </Carte>
  );
}

/** Ce que la carte sait dire de plus, selon ce qu'elle montre. */
function detail(etat: Etat): string {
  if (etat.quoi === 'ouverte') {
    return `Question ${etat.seance.indexCourant + 1} sur ${etat.seance.questionIds.length}, code ${etat.seance.code}.`;
  }

  if (etat.quoi === 'prevue') {
    const combien = etat.seance.questionIds.length;
    return `${combien} question${combien > 1 ? 's' : ''}. La salle n’est pas encore ouverte.`;
  }

  return 'La prochaine paraîtra ici dès qu’elle sera préparée.';
}
