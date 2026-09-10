'use client';

import { useEffect, useState } from 'react';

import { Carte, Meta, TitreSection } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { chargerMesPrix, type Distinction, type Prix } from '@/lib/session/depot';

/**
 * Les prix gagnés en séance collective, sur l'accueil.
 *
 * **Le tableau meurt avec la séance, le trophée reste.** Le classement du jeudi
 * n'est lisible que par ceux qui y étaient, et il disparaît de la vue dès qu'on
 * quitte l'écran ; le prix, lui, revient ici chaque fois qu'on ouvre
 * l'application. C'est ce qui en fait autre chose qu'une félicitation.
 *
 * **Ces documents sont privés et fermés en écriture à tout client**, leur
 * propriétaire compris : seule la Cloud Function les écrit, à partir des
 * réponses. Personne ne voit les prix de personne, et personne ne s'attribue
 * les siens.
 *
 * Les séances sans distinction figurent aussi : « 4e, séance du 12 septembre »
 * est une trace de participation, et elle n'appartient qu'à son porteur.
 */

const MEDAILLES: Record<Distinction, { libelle: string; teinte: string; encre: string }> = {
  diamant: { libelle: 'Diamant', teinte: '#17BEBB', encre: '#053b3a' },
  or: { libelle: 'Or', teinte: '#FECA45', encre: '#4a3a05' },
  argent: { libelle: 'Argent', teinte: '#DBD6CD', encre: '#3f3b3c' },
};

const A_MONTRER = 3;

function dateCourte(millisecondes: number | null): string {
  if (millisecondes === null) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(
    new Date(millisecondes),
  );
}

export function MesPrix({ uid }: { uid: string }) {
  const [prix, setPrix] = useState<Prix[] | null>(null);

  useEffect(() => {
    let vivant = true;
    void chargerMesPrix(uid)
      .then((liste) => {
        if (vivant) setPrix(liste);
      })
      // Une lecture de prix qui échoue ne doit pas emporter l'accueil : le bloc
      // disparaît, le reste de l'écran vit sa vie.
      .catch(() => {
        if (vivant) setPrix([]);
      });
    return () => {
      vivant = false;
    };
  }, [uid]);

  if (prix === null || prix.length === 0) return null;

  const distingues = prix.filter((gagne) => gagne.distinction !== null);
  const visibles = prix.slice(0, A_MONTRER);
  const reste = prix.length - visibles.length;

  return (
    <div>
      <TitreSection indice={`${distingues.length} sur ${prix.length} séances`}>
        Vos prix
      </TitreSection>

      <div
        style={{
          marginTop: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {visibles.map((gagne) => {
          const medaille = gagne.distinction ? MEDAILLES[gagne.distinction] : null;

          return (
            <Carte
              key={gagne.sessionId}
              rayon="var(--radius-lg)"
              rembourrage="14px 18px"
              elevation="petite"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  flex: 'none',
                  borderRadius: 999,
                  background: medaille ? medaille.teinte : 'var(--surface-sunken)',
                  color: medaille ? medaille.encre : 'var(--neutral-60)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--body-sm-size)',
                  fontWeight: 700,
                }}
              >
                {medaille ? <Icone nom="award" taille={17} /> : gagne.rang}
              </span>

              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--body-md-size)',
                    fontWeight: medaille ? 600 : 400,
                    color: 'var(--text-heading)',
                  }}
                >
                  {medaille ? medaille.libelle : `${gagne.rang}e`}
                  {gagne.obtenuLeMs !== null && ` · séance du ${dateCourte(gagne.obtenuLeMs)}`}
                </span>
                <Meta style={{ fontSize: 12 }}>
                  {gagne.justes} bonne{gagne.justes > 1 ? 's' : ''} réponse
                  {gagne.justes > 1 ? 's' : ''} · {gagne.participants} participant
                  {gagne.participants > 1 ? 's' : ''}
                </Meta>
              </span>
            </Carte>
          );
        })}

        {reste > 0 && (
          <Meta style={{ fontSize: 12 }}>
            et {reste} autre{reste > 1 ? 's' : ''} séance{reste > 1 ? 's' : ''}.
          </Meta>
        )}
      </div>
    </div>
  );
}
