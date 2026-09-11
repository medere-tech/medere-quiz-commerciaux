'use client';

import type { Route } from 'next';
import { useEffect, useState } from 'react';

import { Bouton, Carte, EtiquetteStatut, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { seanceOuverte, type Session } from '@/lib/session/depot';

/**
 * « Une séance est ouverte » — sur l'accueil du commercial.
 *
 * **Le geste que ça supprime.** Sans ce bandeau, rejoindre une séance demande
 * d'ouvrir l'application, d'aller sur « Session du jeudi » et de saisir un code
 * annoncé à voix haute. Pour les participants en visioconférence, qui entendent
 * la salle avec du retard et parfois mal, c'est le point de friction de chaque
 * jeudi. Ici, il n'y a qu'à cliquer.
 *
 * **La saisie du code reste**, en secours : deux séances peuvent coexister, et
 * une annonce vaut mieux qu'une devinette.
 *
 * Une séance en pause n'est pas annoncée : inviter à rejoindre un écran qui dit
 * « en pause » serait une promesse déçue. Elle le sera à la reprise.
 */
export function BandeauSeance() {
  const [seance, setSeance] = useState<Session | null>(null);

  useEffect(() => {
    let vivant = true;

    // Une lecture au montage, pas un écouteur : un bandeau qui apparaît au
    // milieu d'une lecture d'accueil déplacerait le contenu sous les doigts.
    seanceOuverte()
      .then((trouvee) => {
        if (vivant) setSeance(trouvee);
      })
      .catch(() => {
        // Pas de séance annoncée plutôt qu'un accueil cassé : la saisie du
        // code reste disponible.
      });

    return () => {
      vivant = false;
    };
  }, []);

  if (!seance) return null;

  return (
    <Carte
      rayon="var(--radius-lg)"
      rembourrage="16px 20px"
      elevation="carte"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
      }}
    >
      <EtiquetteStatut ton="publiee">En direct</EtiquetteStatut>
      <span style={{ flex: 1, minWidth: 180 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--body-md-size)',
            fontWeight: 600,
            color: 'var(--text-heading)',
          }}
        >
          Une séance est ouverte
        </span>
        <Meta style={{ fontSize: 12 }}>
          Question {seance.indexCourant + 1} sur {seance.questionIds.length} · code {seance.code}
        </Meta>
      </span>
      <Bouton href={'/session' as Route} iconeGauche={<Icone nom="users" taille={15} />}>
        Rejoindre
      </Bouton>
    </Carte>
  );
}
