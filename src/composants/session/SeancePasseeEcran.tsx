'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Bouton, Meta } from '@/composants/ds/primitives';
import { EtatErreur, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { DetailSeancePassee } from '@/composants/session/DetailSeancePassee';
import type { Referentiel } from '@/composants/parcours/donnees';
import { authentification } from '@/lib/firebase/client';
import {
  chargerBilan,
  mesSeances,
  type LigneBilan,
  type Session,
} from '@/lib/session/depot';
import { titreDeSeance } from '@/lib/session/seance';
import { lignesTrebuchees, SEUIL_GRAVE } from '@/lib/session/bilan';

/**
 * Page 7 · Une séance passée, en écran entier.
 *
 * **La vue que la maquette dessine à 1024 et à 375.** Elle porte un fil
 * d'Ariane vers la liste et le même détail que le panneau — en compact, donc
 * quatre lignes au lieu de cinq, et le nombre de présents à la place de la
 * durée écoulée, comme la maquette mobile l'arbitre.
 */
export function SeancePasseeEcran({
  seanceId,
  referentiel,
}: {
  seanceId: string;
  referentiel: Referentiel;
}) {
  const routeur = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [seance, setSeance] = useState<Session | null | undefined>(undefined);
  const [bilan, setBilan] = useState<LigneBilan[] | null>(null);

  useEffect(() => authentification().onAuthStateChanged((u) => setUid(u?.uid ?? null)), []);

  useEffect(() => {
    if (!uid) return;
    let vivant = true;

    /*
     * On passe par la liste des séances de l'animatrice plutôt que par une
     * lecture directe : c'est la même requête que la vue précédente, donc
     * déjà en cache côté Firestore, et elle garantit qu'on n'affiche que ses
     * propres séances.
     */
    Promise.all([mesSeances(uid), chargerBilan(seanceId)])
      .then(([seances, lignes]) => {
        if (!vivant) return;
        setSeance(seances.find((candidate) => candidate.id === seanceId) ?? null);
        setBilan(lignes ?? []);
      })
      .catch((panne: unknown) => {
        const code = (panne as { code?: string })?.code;
        console.error(`Lecture de la séance impossible${code ? ` (${code})` : ''}`, panne);
        if (vivant) setSeance(null);
      });

    return () => {
      vivant = false;
    };
  }, [uid, seanceId]);

  const reprendreLesRatees = useCallback(
    (questionIds: string[]) => {
      const parametres = new URLSearchParams({ ratees: questionIds.join(',') });
      routeur.push(`/admin/session/composer?${parametres.toString()}` as Route);
    },
    [routeur],
  );

  if (!uid || seance === undefined) {
    return (
      <div className="preparer">
        <Squelettes lignes={4} />
      </div>
    );
  }

  if (seance === null) {
    return (
      <div className="preparer">
        <EtatErreur
          titre="Séance introuvable"
          texte="Cette séance n’existe plus, ou elle n’est pas la vôtre."
        />
      </div>
    );
  }

  /*
   * Les ratées sont calculées ici aussi : le pied fixe du téléphone porte la
   * même action que la carte, et les deux doivent viser la même liste.
   */
  const ratees = ratéesDe(bilan, referentiel);

  return (
    <div className="preparer">
      <header className="preparer-entete">
        <div>
          <Link
            href={'/admin/session' as Route}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 'var(--body-sm-size)',
              color: 'var(--neutral-60)',
              textDecoration: 'none',
            }}
          >
            <Icone nom="chevronDown" taille={15} style={{ transform: 'rotate(90deg)' }} />
            Séances collectives
          </Link>
          <h1 className="preparer-titre" style={{ marginTop: 12 }}>
            {titreDeSeance(seance)}
          </h1>
        </div>
      </header>

      <div style={{ marginTop: 'var(--air-section)', maxWidth: 760 }}>
        <DetailSeancePassee
          seance={seance}
          bilan={bilan}
          questions={referentiel.questions}
          formations={referentiel.formations}
          compact
          onReprendreLesRatees={reprendreLesRatees}
        />
      </div>

      <Meta style={{ marginTop: 'var(--air-bloc)', fontSize: 13 }}>
        Code {seance.code}. Les réponses nominatives se sont éteintes avec la séance : il ne
        reste que ces compteurs.
      </Meta>

      {/*
        * Sur téléphone, « Reprendre les ratées » quitte la carte pour le pied
        * fixe, comme la maquette le place. C'est le geste pour lequel on ouvre
        * cet écran : il ne doit pas se mériter en défilant.
        */}
      <div className="preparer-pied-mobile">
        <Bouton
          taille="lg"
          disabled={ratees.length === 0}
          iconeGauche={<Icone nom="copy" taille={16} />}
          onClick={() => reprendreLesRatees(ratees)}
        >
          Reprendre les ratées
        </Bouton>
      </div>
    </div>
  );
}

/** Les questions qui ont vraiment trébuché, dans l'ordre où l'écran les montre. */
function ratéesDe(bilan: LigneBilan[] | null, referentiel: Referentiel): string[] {
  if (!bilan) return [];
  return lignesTrebuchees(bilan, referentiel.questions, referentiel.formations)
    .filter((ligne) => ligne.tauxEchec >= SEUIL_GRAVE)
    .map((ligne) => ligne.questionId);
}
