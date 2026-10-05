'use client';

import { useState } from 'react';

import { Bouton, Champ, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { signalerPanne } from '@/lib/journal/client';
import { enregistrerPresentation, retirerPresentation } from '@/lib/sujets/depot';
import {
  ADRESSE_PRESENTATION,
  ErreurPresentation,
  type Presentation,
} from '@/lib/sujets/presentation';

/**
 * La présentation du sujet d'une fiche, dans sa carte de l'écran Formations.
 *
 * **Portée par le sujet, pas par la fiche.** Les fiches d'un même sujet
 * partagent le même lien : le modifier depuis l'une le modifie pour toutes,
 * et la carte le dit.
 *
 * **Hors maquette.** La maquette de l'écran Formations (11) ne prévoit pas
 * cette saisie. Elle est construite avec les primitives du système — champ,
 * bouton, méta —, sans composant nouveau, et signalée comme telle à la
 * livraison.
 */

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/** `aaaa-mm-jj` à Paris, la valeur qu'attend un champ de date. */
function jourDe(date: Date): string {
  return new Intl.DateTimeFormat('fr-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(date);
}

type Etat = 'lecture' | 'saisie' | 'retrait';

export function PresentationSujet({
  sujetId,
  nomSujet,
  presentation,
  onModifiee,
}: {
  sujetId: string;
  nomSujet: string | undefined;
  presentation: Presentation | undefined;
  onModifiee: (sujetId: string, presentation: Presentation | null) => void;
}) {
  const [etat, setEtat] = useState<Etat>('lecture');
  const [url, setUrl] = useState('');
  const [jour, setJour] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [envoi, setEnvoi] = useState(false);

  function ouvrirSaisie() {
    setUrl(presentation?.url ?? '');
    setJour(jourDe(presentation?.presenteeLe ?? new Date()));
    setErreur(undefined);
    setEtat('saisie');
  }

  async function enregistrer() {
    const adresse = url.trim();
    if (!ADRESSE_PRESENTATION.test(adresse)) {
      setErreur('Collez le lien de partage Google Slides ou Google Drive, qui commence par https://.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
      setErreur('Indiquez la date de la présentation à l’équipe.');
      return;
    }
    // Midi à Paris : la date reste la même quel que soit le fuseau qui la relit.
    const presenteeLe = new Date(`${jour}T12:00:00+02:00`);
    if (presenteeLe.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      setErreur('Une présentation se date du jour où elle a eu lieu, pas d’un jour à venir.');
      return;
    }

    setEnvoi(true);
    setErreur(undefined);
    try {
      onModifiee(sujetId, await enregistrerPresentation(sujetId, adresse, presenteeLe));
      setEtat('lecture');
    } catch (panne: unknown) {
      if (panne instanceof ErreurPresentation) {
        setErreur(panne.message);
      } else {
        const code = (panne as { code?: string })?.code;
        console.error(`Présentation non enregistrée${code ? ` (${code})` : ''}`, panne);
        signalerPanne(
          'ecriture',
          new Error(
            `Présentation non enregistrée${code ? ` (${code})` : ''} : ` +
              `${panne instanceof Error ? panne.message : String(panne)}`,
          ),
        );
        setErreur('La présentation n’a pas été enregistrée. Réessayez dans un instant.');
      }
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer() {
    setEnvoi(true);
    setErreur(undefined);
    try {
      await retirerPresentation(sujetId);
      onModifiee(sujetId, null);
      setEtat('lecture');
    } catch (panne: unknown) {
      const code = (panne as { code?: string })?.code;
      console.error(`Présentation non retirée${code ? ` (${code})` : ''}`, panne);
      signalerPanne(
        'ecriture',
        new Error(
          `Présentation non retirée${code ? ` (${code})` : ''} : ` +
            `${panne instanceof Error ? panne.message : String(panne)}`,
        ),
      );
      setErreur('La présentation n’a pas été retirée. Réessayez dans un instant.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="presentation-sujet">
      <span className="presentation-sujet-titre">
        <Icone nom="presentation" taille={16} />
        <span>
          Sujet : {nomSujet ?? 'nom en cours de lecture'}
        </span>
      </span>

      {etat === 'saisie' ? (
        <div className="presentation-sujet-saisie">
          <Champ
            label="Lien de la présentation"
            aide="Google Slides ou Google Drive. Il s’ouvrira dans un nouvel onglet."
            type="url"
            value={url}
            onChange={setUrl}
            placeholder="https://docs.google.com/presentation/…"
          />
          <Champ
            label="Présentée à l’équipe le"
            type="date"
            value={jour}
            onChange={setJour}
            max={jourDe(new Date())}
          />
          {erreur && (
            <Meta style={{ display: 'block', color: '#9E3232' }}>{erreur}</Meta>
          )}
          <span className="presentation-sujet-actions">
            <Bouton taille="sm" onClick={enregistrer} disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
            <Bouton taille="sm" variante="fantome" onClick={() => setEtat('lecture')} disabled={envoi}>
              Annuler
            </Bouton>
          </span>
        </div>
      ) : presentation ? (
        <>
          <Meta style={{ display: 'block' }}>
            Présentée le {FORMAT_DATE.format(presentation.presenteeLe)}
            {presentation.presentePar ? `, saisie par ${presentation.presentePar}` : ''}. Le lien
            vaut pour toutes les fiches de ce sujet.
          </Meta>
          {erreur && <Meta style={{ display: 'block', color: '#9E3232' }}>{erreur}</Meta>}
          <span className="presentation-sujet-actions">
            <Bouton
              taille="sm"
              variante="secondaire"
              externe={presentation.url}
              iconeGauche={<Icone nom="external" taille={14} />}
            >
              Ouvrir
            </Bouton>
            {etat === 'retrait' ? (
              <>
                <Bouton taille="sm" onClick={retirer} disabled={envoi}>
                  {envoi ? 'Retrait…' : 'Confirmer le retrait'}
                </Bouton>
                <Bouton taille="sm" variante="fantome" onClick={() => setEtat('lecture')} disabled={envoi}>
                  Garder
                </Bouton>
              </>
            ) : (
              <>
                <Bouton taille="sm" variante="fantome" onClick={ouvrirSaisie}>
                  Modifier
                </Bouton>
                <Bouton taille="sm" variante="fantome" onClick={() => setEtat('retrait')}>
                  Retirer
                </Bouton>
              </>
            )}
          </span>
        </>
      ) : (
        <>
          <Meta style={{ display: 'block' }}>
            Pas encore de présentation. Le lien vaudra pour toutes les fiches de ce sujet.
          </Meta>
          <span className="presentation-sujet-actions">
            <Bouton taille="sm" variante="secondaire" onClick={ouvrirSaisie}>
              Ajouter la présentation
            </Bouton>
          </span>
        </>
      )}
    </div>
  );
}
