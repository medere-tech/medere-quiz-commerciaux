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
 * **Trois cartes, toujours les mêmes, dans le même ordre.** Le podium ne change
 * pas de forme selon ce qu'on a gagné : une distinction jamais obtenue reste à
 * sa place, en grisé. Un podium vide montre ses trois marches — c'est ce qui
 * donne envie d'y monter. Deux Or gagnés font un « 2 » dans la carte Or, jamais
 * une seconde carte : le nombre de cartes ne bouge pas.
 *
 * **Ces documents sont privés et fermés en écriture à tout client**, leur
 * propriétaire compris : seule la Cloud Function les écrit, à partir des
 * réponses. Personne ne voit les prix de personne, et personne ne s'attribue
 * les siens.
 *
 * **À ne pas confondre avec les récompenses**, juste à côté sur le même écran.
 * Un prix nomme une séance et un rang ; une récompense nomme un palier. Les
 * teintes ne se croisent pas non plus : turquoise, jaune et argent sont
 * réservés ici.
 */

/** L'ordre du podium. Il ne dépend pas de ce qui a été gagné. */
const PODIUM: { cle: Distinction; libelle: string; teinte: string; encre: string }[] = [
  { cle: 'diamant', libelle: 'Diamant', teinte: '#17BEBB', encre: '#053b3a' },
  { cle: 'or', libelle: 'Or', teinte: '#FECA45', encre: '#4a3a05' },
  { cle: 'argent', libelle: 'Argent', teinte: '#DBD6CD', encre: '#3f3b3c' },
];

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

  /*
   * Le bloc n'apparaît qu'à partir de la première séance jouée. Un podium vide
   * montre ses trois marches à qui a déjà participé — mais à qui n'est jamais
   * venu, il ne promet rien qu'il comprenne.
   */
  if (prix === null || prix.length === 0) return null;

  const comptes = Object.fromEntries(
    PODIUM.map(({ cle }) => [cle, prix.filter((gagne) => gagne.distinction === cle).length]),
  ) as Record<Distinction, number>;

  const distingues = prix.filter((gagne) => gagne.distinction !== null).length;
  const sansDistinction = prix.length - distingues;

  return (
    <div>
      <TitreSection
        indice={`${distingues} sur ${prix.length} séance${prix.length > 1 ? 's' : ''}`}
      >
        Vos prix
      </TitreSection>

      {/* La ligne qui dit d'où ils viennent. Les récompenses, juste à côté,
          portent la sienne : sans elles, deux blocs de médaillons teintés se
          ressemblent trop sur le même écran. */}
      <Meta style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
        Gagnés en séance collective, le jeudi.
      </Meta>

      <div className="podium">
        {PODIUM.map(({ cle, libelle, teinte, encre }) => {
          const compte = comptes[cle];
          const gagne = compte > 0;

          return (
            <Carte
              key={cle}
              className="podium-marche"
              rayon="var(--radius-lg)"
              rembourrage="16px 18px"
              elevation={gagne ? 'carte' : 'petite'}
              style={gagne ? undefined : { background: 'var(--surface-page)' }}
            >
              <span
                aria-hidden="true"
                className="podium-medaille"
                style={{
                  background: gagne ? teinte : 'var(--surface-sunken)',
                  color: gagne ? encre : 'var(--neutral-50)',
                }}
              >
                <Icone nom="award" taille={18} />
              </span>

              <span className="podium-nombre">
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-display)',
                    fontSize: 26,
                    lineHeight: 1,
                    color: gagne ? 'var(--text-heading)' : 'var(--neutral-50)',
                  }}
                >
                  {/* Un tiret, pas un zéro : la marche est libre, elle n'est
                      pas un échec chiffré. */}
                  {gagne ? compte : '—'}
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 'var(--body-sm-size)',
                    fontWeight: gagne ? 'var(--weight-semibold)' : 400,
                    color: gagne ? 'var(--text-heading)' : 'var(--neutral-60)',
                  }}
                >
                  {libelle}
                </span>
              </span>

              <span className="visuellement-cache">
                {gagne
                  ? `${compte} prix ${libelle} gagné${compte > 1 ? 's' : ''}`
                  : `Aucun prix ${libelle} pour l’instant`}
              </span>
            </Carte>
          );
        })}
      </div>

      {/* Les séances jouées sans distinction ne disparaissent pas : elles
          n'ont simplement pas de marche. */}
      {sansDistinction > 0 && (
        <Meta style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
          {sansDistinction === 1
            ? 'Une séance jouée sans distinction.'
            : `${sansDistinction} séances jouées sans distinction.`}
        </Meta>
      )}
    </div>
  );
}
