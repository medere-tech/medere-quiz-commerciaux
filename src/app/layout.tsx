import '@/styles/systeme.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { aileron, dmSerifText } from '@/styles/polices';
import { SondeErreurs } from '@/composants/journal/SondeErreurs';

export const metadata: Metadata = {
  title: 'Quiz Médéré',
  description: 'Entraînement au catalogue de formations Médéré.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Les deux classes de police sont posées sur `<html>` : elles n'apportent que
 * les variables CSS `--police-sans` et `--police-display`, que `systeme.css`
 * consomme. C'est aussi ce qui décide de la portée du préchargement — appelé
 * depuis le layout racine, il vaut pour toutes les routes.
 */
export default function RacineLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${aileron.variable} ${dmSerifText.variable}`}>
      <body>
        {/*
         * Ouvrir à l'avance les connexions vers reCAPTCHA.
         *
         * App Check démarre après l'hydratation, et paie à ce moment-là le DNS,
         * le TCP et le TLS vers Google — mesuré entre 207 et 675 ms selon les
         * tours, au moment précis où l'on attend le jeton pour lire Firestore.
         * `preconnect` déplace ce coût pendant l'arrivée du HTML.
         *
         * Rien n'est envoyé, rien n'est téléchargé, l'attestation est
         * identique : on ouvre la porte plus tôt, c'est tout. React remonte ces
         * balises dans le `<head>`.
         */}
        <link rel="preconnect" href="https://www.google.com" />
        <link rel="preconnect" href="https://www.gstatic.com" />
        {/*
         * **Et les trois autres hôtes de la même chaîne.** Le chronogramme d'un
         * chargement froid la donne en entier : `enterprise.js` à 1,6 s, l'échange
         * App Check à 1,8 s, la version gstatic à 1,9 s, puis Firestore à 4,4 s.
         * Chacun de ces hôtes paie son DNS, son TCP et son TLS **au moment où
         * l'écran attend la donnée**. Les ouvrir pendant l'arrivée du HTML ne
         * change ni ce qui est demandé, ni ce qui est attesté.
         */}
        <link rel="preconnect" href="https://content-firebaseappcheck.googleapis.com" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        {/*
         * Le script de reCAPTCHA, demandé tel quel.
         *
         * C'est la **première** requête de la chaîne d'attestation, et elle ne
         * part aujourd'hui qu'une fois le JavaScript de l'application exécuté :
         * tout ce qui suit — la version gstatic, l'ancre, l'échange — s'empile
         * derrière elle. Le préchargement la fait descendre en parallèle des
         * paquets de l'application plutôt qu'après.
         *
         * L'adresse doit être **identique** à celle que le SDK demandera, sans
         * quoi le navigateur téléchargerait deux fois : `render=explicit` est
         * ce que `ReCaptchaEnterpriseProvider` émet, relevé au protocole.
         */}
        <link
          rel="preload"
          as="script"
          href="https://www.google.com/recaptcha/enterprise.js?render=explicit"
        />
        {/*
         * Les pannes qu'aucune frontière React n'attrape — gestionnaires,
         * effets, promesses rejetées. Montée ici pour valoir sur tous les
         * écrans, connexion comprise. Elle ne rend rien.
         */}
        <SondeErreurs />
        {children}
      </body>
    </html>
  );
}
