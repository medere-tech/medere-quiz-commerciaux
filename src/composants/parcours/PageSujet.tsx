import Link from 'next/link';
import type { Route } from 'next';

import { Bouton, Meta, TitreSection } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { Picto } from '@/composants/ds/Picto';
import { FormeFormation, Jauge } from '@/composants/ds/parcours';
import type { Formation } from '@/lib/formations/lecture';
import { dureeLisible, formatDeFiche, type MaitriseSujet } from '@/lib/sujets/sujet';

/**
 * Page d'un sujet, côté commercial — maquette « Médéré Entraînement 8 ».
 *
 * On y arrive depuis « Avancement par formation » : avant un rendez-vous pour
 * réviser, après la présentation d'équipe pour y revenir. Deux gestes — la
 * série sur ce sujet, la présentation — et, dessous, ce qu'on vend : les
 * fiches du catalogue.
 *
 * **Rendue au serveur, sans un octet de script propre.** La page n'a rien
 * d'interactif que des liens. Les deux boutons viennent de la primitive
 * partagée, déjà chargée par toute l'application.
 *
 * **Ce qui s'écarte de la maquette, et pourquoi** (validé par Déthié le
 * 5 octobre 2026). La maquette dessine une carte par *format*. Le catalogue
 * réel range souvent plusieurs fiches sous un même format, aux titres
 * différents, et deux paires ne se distinguent que par leur numéro d'action
 * DPC. La carte garde donc le dessin de la maquette — pastille d'icône,
 * format en caractères de titre, lien vers la fiche publique — et porte en
 * plus le titre de la fiche, sa modalité, son public et sa durée. Le numéro
 * d'action ne paraît que lorsqu'il est le seul discriminant. La ligne de
 * détail de la maquette (« 2 jours, à Paris ») n'a pas de source : elle cède
 * la place à la durée, qui en a une.
 *
 * Un sujet sans question n'a pas d'écran à lui : l'accueil ne mène qu'à des
 * sujets qui en ont. Arrivé là par une adresse directe, on voit la même page,
 * sans série à lancer ni maîtrise à afficher.
 */

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
});

export type ProprietesPageSujet = {
  id: string;
  nom: string;
  publics: string[];
  forme: { fichier: string; couleur: string };
  fiches: Formation[];
  /** Fiches que seul leur numéro d'action DPC distingue d'une voisine. */
  indiscernables: string[];
  maitrise: MaitriseSujet;
  presentation: { url: string; presenteeLeMs: number; presentePar: string } | null;
};

export function PageSujet(proprietes: ProprietesPageSujet) {
  const { id, nom, publics, forme, fiches, maitrise, presentation } = proprietes;
  const avecQuestions = maitrise.total > 0;
  const date = presentation ? FORMAT_DATE.format(presentation.presenteeLeMs) : null;
  const routeSerie = `/serie?sujet=${id}` as Route;

  const actions = (pleineLargeur: boolean) => (
    <>
      {avecQuestions && (
        <Bouton
          taille="lg"
          pleineLargeur={pleineLargeur}
          href={routeSerie}
          iconeGauche={<Icone nom="play" taille={16} />}
        >
          Lancer une série sur ce sujet
        </Bouton>
      )}
      {presentation && (
        <Bouton
          taille="lg"
          variante={avecQuestions ? 'secondaire' : 'primaire'}
          pleineLargeur={pleineLargeur}
          externe={presentation.url}
          iconeGauche={<Icone nom="external" taille={16} />}
        >
          Ouvrir la présentation
        </Bouton>
      )}
    </>
  );

  const aDesActions = avecQuestions || presentation !== null;

  return (
    <div className="page-admin page-sujet">
      <Link href="/" className="retour-accueil">
        <Icone nom="chevronRight" taille={16} style={{ transform: 'rotate(180deg)' }} />
        Accueil
      </Link>

      {/* Pas de `Carte` ici : sur téléphone, la maquette retire la carte et
          pose le titre sur le fond de page. `Carte` dessine en style en
          ligne, qu'une règle de média ne défait pas. Mêmes jetons, posés
          par la feuille de style. */}
      <section className="sujet-entete">
        {/* Le décor de la maquette : la forme du sujet, débordant du coin. Le
            même fichier que le repère à côté du titre — aucune requête de
            plus, et rien de téléchargé pour rien sur téléphone. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/formes/${forme.fichier}`} alt="" aria-hidden="true" className="sujet-decor" />

        <div className="sujet-entete-grille">
          <div style={{ minWidth: 0 }}>
            <span className="sujet-publics">
              <FormeFormation fichier={forme.fichier} taille={24} />
              <Meta style={{ color: 'var(--neutral-70)' }}>
                {publics.join(', ') || 'Public non précisé'}
              </Meta>
            </span>
            <h1 className="sujet-titre">{nom}</h1>

            {aDesActions && <div className="sujet-actions action-doublee">{actions(false)}</div>}

            <div className="sujet-note">
              {presentation ? (
                <span className="action-doublee note-presentation">
                  <Icone nom="presentation" taille={16} style={{ marginTop: 2 }} />
                  <span>
                    Présentée à l’équipe le {date}
                    {presentation.presentePar ? ` par ${presentation.presentePar}` : ''}. Elle
                    s’ouvre dans un nouvel onglet.
                  </span>
                </span>
              ) : (
                <div className="encart-sujet">
                  <Picto nom="livre" taille={34} />
                  <span>
                    <span className="encart-sujet-titre">
                      Pas encore de présentation pour ce sujet
                    </span>
                    <span className="encart-sujet-texte">
                      Elle apparaîtra ici après la prochaine séance d’équipe. Les questions et les
                      fiches suffisent pour réviser.
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {avecQuestions && (
            <div className="sujet-maitrise">
              <BlocMaitrise maitrise={maitrise} />
            </div>
          )}
        </div>
      </section>

      <Fiches fiches={fiches} indiscernables={new Set(proprietes.indiscernables)} />

      {aDesActions && (
        <div className="pied-mobile">
          {actions(true)}
          {presentation && avecQuestions && (
            <Meta style={{ display: 'block', textAlign: 'center', fontSize: 12 }}>
              Présentation du {date}, dans un nouvel onglet
            </Meta>
          )}
        </div>
      )}
    </div>
  );
}

/** Maîtrise : un chiffre, une jauge, les questions vues. Sous 50 %, le rouge. */
function BlocMaitrise({ maitrise }: { maitrise: MaitriseSujet }) {
  const faible = maitrise.pourcentage < 50;
  return (
    <div>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="maitrise-chiffre" style={{ color: faible ? '#9E3232' : 'var(--text-heading)' }}>
          {maitrise.pourcentage} %
        </span>
        <Meta>de maîtrise</Meta>
      </span>
      <div className="maitrise-jauge">
        <Jauge
          valeur={maitrise.pourcentage}
          hauteur={6}
          ton={faible ? 'var(--status-danger)' : 'var(--neutral-100)'}
        />
      </div>
      <Meta style={{ display: 'block', marginTop: 12, color: 'var(--neutral-70)' }}>
        <b style={{ color: 'var(--text-heading)' }}>{maitrise.vues}</b> question
        {maitrise.vues > 1 ? 's' : ''} vue{maitrise.vues > 1 ? 's' : ''} sur {maitrise.total}
        {maitrise.aRevoir > 0 ? `, ${maitrise.aRevoir} à revoir` : ''}
      </Meta>
    </div>
  );
}

function Fiches({ fiches, indiscernables }: { fiches: Formation[]; indiscernables: Set<string> }) {
  const enLigne = fiches.filter((fiche) => fiche.urlWebflow.length > 0).length;
  const indice =
    fiches.length === 1
      ? 'une seule fiche'
      : `${fiches.length} fiches, ${enLigne} en ligne`;

  return (
    <section className="sujet-fiches">
      <TitreSection indice={fiches.length > 0 ? indice : undefined}>Fiches du catalogue</TitreSection>
      {fiches.length === 0 ? (
        <Meta style={{ display: 'block', marginTop: 14 }}>
          Aucune fiche de ce sujet n’est au catalogue en ce moment.
        </Meta>
      ) : (
        <div
          className={`grille-fiches${fiches.length === 1 ? ' grille-fiches-seule' : ''}`}
          // Autant de colonnes que de fiches, trois au plus : la maquette ne
          // laisse jamais une colonne vide à droite.
          style={{ ['--colonnes' as string]: Math.min(fiches.length, 3) }}
        >
          {fiches.map((fiche) => (
            <CarteFiche key={fiche.id} fiche={fiche} numero={indiscernables.has(fiche.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * La fiche d'un format. Sans lien : bordure complète, pas d'ombre, mention
 * explicite — c'est le dessin de la maquette pour une fiche pas encore en
 * ligne.
 */
function CarteFiche({ fiche, numero }: { fiche: Formation; numero: boolean }) {
  const format = formatDeFiche(fiche);
  const lien = fiche.urlWebflow.length > 0;
  const details = [fiche.modalite, fiche.cibles.join(', '), dureeLisible(fiche.dureeTotale)]
    .map((valeur) => valeur.trim())
    .filter((valeur) => valeur.length > 0);

  return (
    <div className={`carte-fiche${lien ? '' : ' carte-fiche-hors-ligne'}`}>
      <span className={`pastille-format${lien ? '' : ' pastille-format-hors-ligne'}`}>
        <Icone nom={format.icone} taille={20} couleur={lien ? '#fff' : 'var(--neutral-60)'} />
      </span>
      <span className="carte-fiche-corps">
        <span className="carte-fiche-format">{format.libelle}</span>
        <span className="carte-fiche-titre">{fiche.nom}</span>
        {details.length > 0 && <span className="carte-fiche-details">{details.join(' · ')}</span>}
        {numero && (
          <span className="carte-fiche-details">N° d’action DPC {fiche.numeroActionDpc}</span>
        )}
      </span>
      <span className="carte-fiche-lien">
        {lien ? (
          <a href={fiche.urlWebflow} target="_blank" rel="noopener noreferrer" className="lien-fiche">
            <span className="libelle-long">Voir la fiche sur medere.fr</span>
            <span className="libelle-court">Fiche</span>
            <Icone nom="external" taille={15} />
          </a>
        ) : (
          <span className="fiche-hors-ligne">
            <Icone nom="clock" taille={15} />
            <span className="libelle-long">Fiche pas encore en ligne</span>
            <span className="libelle-court">Pas en ligne</span>
          </span>
        )}
      </span>
    </div>
  );
}
