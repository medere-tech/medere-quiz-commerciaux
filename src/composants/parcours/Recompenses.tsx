'use client';

import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';

import { Bouton, Carte, Meta, TitreSection } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Picto } from '@/composants/ds/Picto';
import { Pastille } from '@/composants/session/Pastille';
import { Jauge } from '@/composants/ds/parcours';
import { Squelettes } from '@/composants/ds/etats';
import {
  useDonneesParcours,
  type ParcoursSeme,
  type Referentiel,
} from '@/composants/parcours/donnees';
import {
  clefDuJour,
  semaineAffichee,
  serieAffichee,
  type JourDeSemaine,
} from '@/lib/serie/assiduite';
import { avancementParFormation } from '@/lib/serie/maitrise';
import { mesurerAssiduite, mesurerCatalogue, vueDesRecompenses, type RecompenseVue } from '@/lib/serie/recompenses';
import {
  chargerMonRang,
  chargerPodium,
  phraseDuRang,
  serieDuJour,
  type MonRang,
  type Podium,
} from '@/lib/serie/podium';

/**
 * 04b · Récompenses et équipe.
 *
 * **La maquette fait foi, sauf sur un bloc, et l'écart est assumé.** Elle
 * dessine un classement complet de l'équipe sur le taux de maîtrise. On publie
 * un **podium sur la régularité** :
 *
 * - **La régularité, pas la maîtrise.** C'est ce que l'outil cherche à
 *   encourager, et être peu régulier ne dit pas qu'on est mauvais. Le taux de
 *   maîtrise ne sort jamais de `users/{uid}`.
 * - **Le podium, pas le classement.** Sur une équipe de dix, un classement
 *   complet expose publiquement ceux qui rament — et ce sont eux qui ont le
 *   plus besoin de l'outil.
 *
 * Chacun voit en plus **son** rang et ce qui le sépare du podium, dans un
 * document que lui seul peut lire. Voir `src/lib/serie/podium.ts` et le README.
 *
 * **Deux adaptations mobiles, à dire.** La maquette mobile n'y montre que les
 * quatre récompenses obtenues, avec un lien « Toutes ». Cet écran *est* ce
 * lien : il montre donc les neuf, en deux colonnes. Et la barre de pied reprend
 * son action — « Passer à cinq jours » — en la rendant juste : le compte suit
 * la série du moment.
 */
export function Recompenses({
  referentiel,
  parcours,
}: {
  referentiel: Referentiel;
  parcours: ParcoursSeme;
}) {
  const chargement = useDonneesParcours(referentiel, parcours);
  const [podium, setPodium] = useState<Podium | null>(null);
  const [monRang, setMonRang] = useState<MonRang | null>(null);

  /*
   * Une lecture au montage, pas un écouteur : un podium bouge au rythme d'une
   * série par personne et par jour. Le faire changer sous les yeux pendant
   * qu'on le lit n'apprendrait rien à personne.
   */
  useEffect(() => {
    let vivant = true;

    chargerPodium()
      .then((lu) => {
        if (vivant) setPodium(lu ?? { lignes: [], autresAuDernierRang: 0 });
      })
      .catch(() => {
        /* Le bloc équipe est un supplément : l'écran des récompenses reste
           entier sans lui, et un podium absent se dit plutôt qu'il ne ment. */
        if (vivant) setPodium({ lignes: [], autresAuDernierRang: 0 });
      });

    return () => {
      vivant = false;
    };
  }, []);

  useEffect(() => {
    if (chargement.etat !== 'pret') return;
    let vivant = true;

    chargerMonRang(chargement.donnees.uid)
      .then((lu) => {
        if (vivant) setMonRang(lu);
      })
      .catch(() => {
        if (vivant) setMonRang(null);
      });

    return () => {
      vivant = false;
    };
  }, [chargement]);

  const vue = useMemo(() => {
    if (chargement.etat !== 'pret') return null;
    const { questions, formations, etats, progression } = chargement.donnees;

    const avancements = avancementParFormation(formations, questions, etats);
    const scenarios = new Set(
      questions.filter((question) => question.type === 'scenario').map((question) => question.id),
    );

    const mesures = {
      ...mesurerCatalogue(
        avancements,
        etats.filter((etat) => scenarios.has(etat.id)),
      ),
      ...mesurerAssiduite(progression.assiduite, clefDuJour(new Date())),
    };

    const toutes = vueDesRecompenses(progression.recompenses, mesures);

    return {
      uid: chargement.donnees.uid,
      assiduite: progression.assiduite,
      toutes,
      gagnees: toutes.filter((recompense) => recompense.obtenueLe !== null),
      prochaine: laPlusProche(toutes),
    };
  }, [chargement]);

  if (!vue) {
    return (
      <div className="page-admin">
        <Squelettes lignes={4} />
      </div>
    );
  }

  const aujourdhui = clefDuJour(new Date());
  const serie = serieAffichee(vue.assiduite, aujourdhui);
  const semaine = semaineAffichee(vue.assiduite, aujourdhui);

  return (
    <div className="page-admin recompenses-page">
      <div>
        <h1 className="recompenses-titre">Vos récompenses</h1>
        <p className="recompenses-sous-titre">
          {vue.gagnees.length === 0
            ? `Aucune récompense obtenue sur ${vue.toutes.length}. Elles se débloquent par la régularité, pas par le volume.`
            : `${vue.gagnees.length} récompense${vue.gagnees.length > 1 ? 's' : ''} obtenue${vue.gagnees.length > 1 ? 's' : ''} sur ${vue.toutes.length}. Elles se débloquent par la régularité, pas par le volume.`}
        </p>
      </div>

      <div className="recompenses-grille">
        <div className="recompenses-colonne">
          <div className="recompenses-medaillons">
            {vue.toutes.map((recompense) => (
              <Medaillon key={recompense.id} recompense={recompense} />
            ))}
          </div>

          {vue.prochaine && <ProchaineRecompense recompense={vue.prochaine} />}
        </div>

        <div className="recompenses-cote">
          <CarteRegularite assiduite={vue.assiduite} serie={serie} semaine={semaine} />

          <BlocEquipe podium={podium} monRang={monRang} monUid={vue.uid} />
        </div>
      </div>

      {/* Le pied fixe du téléphone. Il ne rend que sous 900 px — la feuille de
          style s'en charge — et reprend l'action de la maquette mobile. */}
      <div className="recompenses-pied">
        <Bouton
          taille="lg"
          pleineLargeur
          href={'/serie' as Route}
          iconeGauche={<Icone nom="play" taille={16} />}
        >
          {serie === 0 ? 'Commencer une série' : `Passer à ${serie + 1} jours`}
        </Bouton>
      </div>
    </div>
  );
}

/** La plus proche des récompenses non obtenues, celle qu'on met en avant. */
function laPlusProche(toutes: RecompenseVue[]): RecompenseVue | null {
  const restantes = toutes.filter(
    (recompense) => recompense.obtenueLe === null && recompense.jaugeVue !== null,
  );

  return (
    restantes.sort((gauche, droite) => part(droite) - part(gauche))[0] ?? null
  );
}

function part(recompense: RecompenseVue): number {
  const jauge = recompense.jaugeVue;
  if (!jauge || jauge.objectif === 0) return 0;
  return jauge.valeur / jauge.objectif;
}

/* ------------------------------------------------------------- les neuf */

function Medaillon({ recompense }: { recompense: RecompenseVue }) {
  const gagnee = recompense.obtenueLe !== null;

  return (
    <Carte
      rayon="var(--radius-lg)"
      rembourrage="20px"
      elevation={gagnee ? 'carte' : 'aucune'}
      className="recompense-medaillon"
      style={{
        // Bordure complète sur les non obtenues, jamais un filet d'un côté.
        border: gagnee ? 'none' : '1px solid var(--border-subtle)',
        background: gagnee ? 'var(--surface-card)' : 'var(--surface-page)',
      }}
    >
      <span
        style={{
          width: 48,
          height: 48,
          flex: 'none',
          borderRadius: 999,
          background: gagnee ? recompense.teinte : 'var(--surface-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Picto nom={recompense.picto} taille={28} />
      </span>

      <span
        style={{
          display: 'block',
          marginTop: 14,
          fontSize: 'var(--body-md-size)',
          fontWeight: 600,
          lineHeight: 1.35,
          color: gagnee ? 'var(--text-heading)' : 'var(--neutral-60)',
          textWrap: 'pretty',
        }}
      >
        {recompense.libelle}
      </span>

      <Meta style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
        {gagnee ? `Obtenue le ${dateCourte(recompense.obtenueLe!)}` : (recompense.jaugeVue?.reste ?? 'À obtenir')}
      </Meta>
    </Carte>
  );
}

/** « 12 mars ». */
function dateCourte(jour: string): string {
  const [annee, mois, quantieme] = jour.split('-').map(Number);
  if (!annee || !mois || !quantieme) return jour;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(annee, mois - 1, quantieme)),
  );
}

function ProchaineRecompense({ recompense }: { recompense: RecompenseVue }) {
  const jauge = recompense.jaugeVue!;

  return (
    <Carte
      rayon="var(--radius-xl)"
      rembourrage="20px 24px"
      elevation="carte"
      className="recompense-prochaine"
    >
      <span
        style={{
          width: 46,
          height: 46,
          flex: 'none',
          borderRadius: 999,
          background: recompense.teinte,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Picto nom={recompense.picto} taille={26} />
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            lineHeight: 1.2,
            color: 'var(--text-heading)',
            textWrap: 'pretty',
          }}
        >
          {jauge.reste === '' ? 'La prochaine est à portée' : jauge.reste}
        </span>
        <Meta style={{ display: 'block', marginTop: 6 }}>{recompense.libelle}</Meta>
      </span>

      <span className="recompense-prochaine-jauge">
        <Jauge valeur={jauge.objectif === 0 ? 0 : (jauge.valeur / jauge.objectif) * 100} />
      </span>

      <span
        style={{
          flex: 'none',
          fontSize: 'var(--body-md-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {jauge.valeur} / {jauge.objectif}
      </span>
    </Carte>
  );
}

/* ------------------------------------------------------ votre régularité */

function CarteRegularite({
  assiduite,
  serie,
  semaine,
}: {
  assiduite: { record: number };
  serie: number;
  semaine: JourDeSemaine[];
}) {
  return (
    <Carte rayon="var(--radius-xl)" rembourrage="20px 22px" elevation="carte">
      <Meta style={{ fontSize: 13 }}>Votre régularité</Meta>

      <span
        style={{
          display: 'block',
          marginTop: 6,
          fontFamily: 'var(--font-display)',
          fontSize: 40,
          lineHeight: 1,
          color: 'var(--text-heading)',
        }}
      >
        {serie} {serie > 1 ? 'jours' : 'jour'}
      </span>

      <span
        style={{
          display: 'block',
          marginTop: 4,
          fontSize: 'var(--body-sm-size)',
          color: 'var(--neutral-70)',
        }}
      >
        {serie === 0
          ? `votre record est de ${assiduite.record}`
          : `d’affilée · votre record est de ${assiduite.record}`}
      </span>

      <div className="recompenses-semaine">
        {semaine.map((jour, rang) => (
          <span
            key={rang}
            className="recompenses-jour"
            /* Le fond suit le jour ouvré, pas le fait d'être passé : il n'y a
               rien à rattraper un dimanche. Même règle qu'`ObjectifDuJour`. */
            style={{
              background: jour.fait
                ? '#17BEBB'
                : jour.ouvre
                  ? 'var(--surface-chip)'
                  : 'var(--surface-page)',
            }}
            aria-label={jour.lettre}
          >
            {jour.fait && <Icone nom="check" taille={13} />}
          </span>
        ))}
      </div>
    </Carte>
  );
}

/* --------------------------------------------------------------- l'équipe */

function BlocEquipe({
  podium,
  monRang,
  monUid,
}: {
  podium: Podium | null;
  monRang: MonRang | null;
  monUid: string;
}) {
  if (podium === null) {
    return (
      <div>
        <TitreSection indice="régularité">Équipe</TitreSection>
        <Carte
          rayon="var(--radius-lg)"
          rembourrage="18px 20px"
          elevation="petite"
          style={{ marginTop: 'var(--space-4)' }}
        >
          <Squelettes lignes={2} />
        </Carte>
      </div>
    );
  }

  const maintenant = new Date();
  const meilleure = Math.max(1, ...podium.lignes.map((ligne) => serieDuJour(ligne, maintenant)));

  return (
    <div>
      <TitreSection indice="régularité">Équipe</TitreSection>

      {/*
        * **Ce que ce bloc ne dit pas est le sujet.** Trois valeurs nommées, et
        * personne d'autre : ni les suivants, ni le dernier, ni combien de
        * personnes jouent. Le rang de chacun lui est réservé.
        */}
      <Meta style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
        Les plus réguliers de l’équipe. Les scores restent privés.
      </Meta>

      <Carte
        rayon="var(--radius-lg)"
        rembourrage="18px 20px"
        elevation="petite"
        className="equipe-liste"
        style={{ marginTop: 'var(--space-4)' }}
      >
        {podium.lignes.length === 0 ? (
          <Meta style={{ fontSize: 13 }}>
            Le podium s’affiche dès que trois personnes ont une série en cours.
          </Meta>
        ) : (
          <>
            {podium.lignes.map((ligne) => {
              const moi = ligne.uid === monUid;
              const jours = serieDuJour(ligne, maintenant);

              return (
                <span key={ligne.uid} className="equipe-ligne">
                  <span className="equipe-rang">{ligne.rang}</span>
                  <Pastille nom={ligne.nom} avatar={ligne.avatar} taille={26} />
                  <span
                    className="equipe-nom"
                    style={{ fontWeight: moi ? 600 : 400 }}
                  >
                    {ligne.nom}
                    {moi ? ' · vous' : ''}
                  </span>
                  <span className="equipe-jauge">
                    <Jauge valeur={(jours / meilleure) * 100} />
                  </span>
                  <span className="equipe-jours">
                    {jours} {jours > 1 ? 'j' : 'j'}
                  </span>
                </span>
              );
            })}

            {podium.autresAuDernierRang > 0 && (
              <Meta style={{ fontSize: 12 }}>
                et {podium.autresAuDernierRang} autres à égalité
              </Meta>
            )}
          </>
        )}

        {/*
          * **Le rang et l'écart, ensemble.** Le rang sans l'écart ne dit pas
          * quoi faire ; l'écart sans le rang ne dit pas où l'on est. Et
          * l'écart vise la dernière valeur du podium — déjà affichée — donc il
          * n'apprend rien sur le voisin immédiat.
          */}
        {monRang !== null && monRang.ecart !== null && (
          <Meta style={{ fontSize: 12 }}>{phraseDuRang(monRang)}</Meta>
        )}
      </Carte>
    </div>
  );
}
