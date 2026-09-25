'use client';

import type { Route } from 'next';

import { Bouton, Carte, Meta, TitreSection } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Picto } from '@/composants/ds/Picto';
import { vueDesRecompenses, type Mesures, type RecompenseVue } from '@/lib/serie/recompenses';

/**
 * Les récompenses sur l'accueil : les paliers franchis sur le catalogue.
 *
 * **Ce n'est pas le même objet que les prix, et l'écran doit le dire.** Un prix
 * est le trophée d'un jeudi vécu : il nomme une séance, une date de séance, un
 * rang. Une récompense est un palier individuel : elle dit « palier atteint
 * le… » et ne nomme jamais de séance ni de rang.
 *
 * **Les teintes ne se croisent pas non plus** : turquoise, jaune et argent
 * disent « Diamant », « Or », « Argent » un peu plus haut sur le même écran.
 * Aucune récompense ne les emprunte — deux systèmes qui partagent une couleur
 * sont deux systèmes qu'on confond d'un coup d'œil, et un test le verrouille.
 *
 * **Quatre sur neuf sont montrées** : celles qui sont gagnées d'abord, les plus
 * proches ensuite. La maquette en montre quatre et annonce le reste ; empiler
 * les neuf sur l'accueil transformerait un encouragement en catalogue.
 */

const A_MONTRER = 4;

function dateCourte(jour: string): string {
  const [annee, mois, quantieme] = jour.split('-').map(Number);
  if (!annee || !mois || !quantieme) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(annee, mois - 1, quantieme)),
  );
}

/** Ce qui manque à une récompense pour être gagnée, en part de son objectif. */
function proximite(recompense: RecompenseVue): number {
  if (!recompense.jaugeVue || recompense.jaugeVue.objectif === 0) return 0;
  return recompense.jaugeVue.valeur / recompense.jaugeVue.objectif;
}

export function MesRecompenses({
  carte,
  mesures,
}: {
  carte: Record<string, string>;
  mesures: Mesures;
}) {
  const toutes = vueDesRecompenses(carte, mesures);
  const gagnees = toutes.filter((recompense) => recompense.obtenueLe !== null);
  const restantes = toutes
    .filter((recompense) => recompense.obtenueLe === null)
    .sort((a, b) => proximite(b) - proximite(a));

  const visibles = [...gagnees, ...restantes].slice(0, A_MONTRER);
  const aObtenir = restantes.length;

  return (
    <div>
      <TitreSection indice={`${gagnees.length} sur ${toutes.length}`}>Récompenses</TitreSection>

      <Carte
        rayon="var(--radius-lg)"
        rembourrage="18px 20px"
        elevation="petite"
        className="recompenses-liste"
        style={{ marginTop: 'var(--space-4)' }}
      >
        {visibles.map((recompense) => {
          const gagnee = recompense.obtenueLe !== null;

          return (
            <span key={recompense.id} className="recompense-ligne">
              <span
                className="recompense-medaille"
                style={{
                  width: 38,
                  height: 38,
                  flex: 'none',
                  borderRadius: 999,
                  background: gagnee ? recompense.teinte : 'var(--surface-sunken)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Picto
                  nom={recompense.picto}
                  taille={24}
                  style={gagnee ? undefined : { opacity: 0.32 }}
                />
              </span>

              <span className="recompense-texte" style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--body-sm-size)',
                    lineHeight: 1.4,
                    color: gagnee ? 'var(--text-body)' : 'var(--neutral-60)',
                    textWrap: 'pretty',
                  }}
                >
                  {recompense.libelle}
                </span>
                {/* « Palier atteint le… », jamais « séance du… » : c'est la
                    phrase qui sépare une récompense d'un prix. */}
                <Meta style={{ fontSize: 12 }}>
                  {gagnee
                    ? `Palier atteint le ${dateCourte(recompense.obtenueLe!)}`
                    : (recompense.jaugeVue?.reste ?? 'à débloquer')}
                </Meta>
              </span>
            </span>
          );
        })}

        {aObtenir > 0 && (
          <Meta className="recompenses-reste" style={{ fontSize: 12 }}>
            {aObtenir === 1
              ? 'Une récompense reste à obtenir.'
              : `${aObtenir} récompenses restent à obtenir.`}
          </Meta>
        )}
      </Carte>

      {/*
        * **Après la section, pas à côté du titre.** Quelqu'un qui vient de
        * lire ses quatre médaillons continue là où son regard s'arrête ; le
        * mettre en tête l'aurait obligé à remonter.
        *
        * Un lien, pas un bouton : la primitive `Bouton` accepte un `href` pour
        * ça, et c'est ce qui le fait précharger.
        */}
      <span className="recompenses-suite">
        <Bouton
          taille="sm"
          variante="secondaire"
          href={'/recompenses' as Route}
          iconeDroite={<Icone nom="chevronRight" taille={14} />}
        >
          Toutes les récompenses
        </Bouton>
      </span>
    </div>
  );
}
