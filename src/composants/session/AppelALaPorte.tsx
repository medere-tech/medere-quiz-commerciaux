'use client';

import { useEffect, useState } from 'react';

import { Bouton, Meta } from '@/composants/ds/primitives';
import { Icone } from '@/composants/ds/Icone';
import { ecouterMonAppel, frapperALaPorte, type Appel } from '@/lib/session/depot';

/**
 * Frapper à la porte, côté retardataire.
 *
 * **La consigne existait déjà, le moyen de l'exécuter non.** L'écran d'accès
 * disait « Signalez-vous à l'animatrice » et s'arrêtait là : il fallait sortir
 * de l'outil, retrouver Noémie sur un autre canal, et espérer qu'elle regarde.
 * C'est le premier chemin qui remonte de la salle vers elle.
 *
 * **Trois états, et le troisième ne demande aucun geste.** On frappe ; on voit
 * que c'est passé ; la porte se rouvre et le refus s'efface tout seul — ce
 * dernier point est tenu par l'écran d'accès, qui écoute la séance.
 *
 * **Le rappel est borné à une minute**, et il réécrit le même document plutôt
 * que d'en ajouter un. Dix personnes qui insistent ne produisent pas dix
 * lignes devant l'animatrice : c'est la seule protection dont elle dispose
 * pendant qu'elle anime.
 *
 * **Ajout hors maquette**, et une lacune signalée plutôt que comblée : le jeu
 * d'icônes n'en a aucune pour « prévenir ». `alert` se lit comme un danger,
 * `users` désigne la salle. Le bouton n'en porte donc pas — son libellé dit ce
 * qui va se produire, et une icône empruntée à un autre sens vaudrait moins
 * que pas d'icône. À revoir si Claude Design en fournit une.
 */

/** Le délai avant de pouvoir rappeler. Une minute, décidée avec Déthié. */
const RAPPEL_APRES_MS = 60_000;

export function AppelALaPorte({
  sessionId,
  uid,
  nom,
  avatar,
}: {
  /** La séance dont la porte est fermée — celle qu'on vient de se voir refuser. */
  sessionId: string;
  uid: string;
  /** Le nom tel qu'il apparaîtra chez l'animatrice, choisi par son porteur. */
  nom: string;
  avatar: string;
}) {
  const [appel, setAppel] = useState<Appel | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  /*
   * **Ce que l'écran doit se rappeler quand le document disparaît.**
   *
   * L'animatrice peut écarter un appel plutôt que d'ouvrir. Le document part
   * alors, l'écouteur rend `null`, et sans mémoire l'écran revenait à
   * « Prévenir l'animatrice » comme si rien ne s'était produit : le
   * retardataire en concluait qu'elle n'avait rien vu, et refrappait
   * aussitôt — le délai d'une minute s'évaporant avec le document.
   *
   * Vu au navigateur, pas déduit. On retient donc l'instant de la dernière
   * frappe, qui survit à l'effacement : il porte l'aveu « elle a répondu, et
   * sa réponse est non » et il porte le délai.
   */
  const [derniereFrappeMs, setDerniereFrappeMs] = useState<number | null>(null);

  /*
   * **L'appel se relit, il ne se retient pas.** Un onglet rechargé — ce qui
   * arrive sur un téléphone qu'on reverrouille — afficherait sinon de nouveau
   * « Prévenir l'animatrice » comme si rien n'avait été fait, et la personne
   * frapperait une seconde fois sans le savoir.
   */
  useEffect(() => {
    return ecouterMonAppel(sessionId, uid, (recu) => {
      setAppel(recu);
      // Un appel retrouvé au remontage vaut une frappe : le délai repart de
      // son heure à lui, pas de l'ouverture de l'onglet.
      if (recu?.demandeLeMs != null) setDerniereFrappeMs(recu.demandeLeMs);
    });
  }, [sessionId, uid]);

  /*
   * L'horloge ne tourne que tant qu'elle sert : le temps que le rappel
   * redevienne possible. Après, plus rien ne dépend de la seconde qui passe.
   */
  /* « On a frappé » se lit sur l'instant retenu, pas sur le document : c'est
     tout l'intérêt, puisque le document peut avoir été écarté. */
  const aFrappe = derniereFrappeMs !== null;
  const ecarte = aFrappe && appel === null;
  const depuisMs = maintenant - (derniereFrappeMs ?? maintenant);
  const rappelPossible = aFrappe && depuisMs >= RAPPEL_APRES_MS;

  useEffect(() => {
    if (!aFrappe || rappelPossible) return;
    const battement = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(battement);
  }, [aFrappe, rappelPossible]);

  async function frapper() {
    setEnvoi(true);
    setEchec(false);
    try {
      await frapperALaPorte(sessionId, uid, nom, avatar);
      /* L'horodatage du serveur arrivera par l'écouteur ; celui-ci tient le
         délai en attendant, pour que le bouton ne réapparaisse pas aussitôt. */
      setDerniereFrappeMs(Date.now());
    } catch {
      /* Un appel qui n'est pas parti ne doit pas ressembler à un appel parti :
         l'écouteur ne verra rien, et sans ce message l'écran resterait muet. */
      setEchec(true);
    } finally {
      setEnvoi(false);
    }
  }

  if (!aFrappe) {
    return (
      <span style={{ display: 'block', marginTop: 12 }}>
        <Bouton
          taille="sm"
          variante="secondaire"
          disabled={envoi || nom.trim() === ''}
          onClick={() => void frapper()}
        >
          {envoi ? 'Envoi…' : 'Prévenir l’animatrice'}
        </Bouton>
        {echec && (
          <Meta style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            Le message n’est pas parti. Réessayez.
          </Meta>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: 'block', marginTop: 12 }}>
      {/*
        * `role="status"` : la confirmation remplace le bouton sans que rien ne
        * bouge ailleurs. Sans annonce, elle n'existerait que pour qui regarde
        * au bon endroit — et l'on frapperait de nouveau.
        */}
      <span
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 'var(--body-sm-size)',
          fontWeight: 600,
          color: 'var(--text-heading)',
        }}
      >
        <Icone nom={ecarte ? 'close' : 'check'} taille={15} />
        {ecarte ? 'L’animatrice a écarté votre appel' : 'L’animatrice est prévenue'}
      </span>

      <Meta style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
        {ecarte
          ? /* **Elle a répondu, et sa réponse est non.** Seule l'animatrice
               peut écarter un appel : son effacement est donc un geste, pas un
               incident. Le taire ferait croire qu'elle n'a rien vu. */
            `Elle ne rouvre pas l’accès pour l’instant. ${
              rappelPossible ? 'Vous pouvez la relancer.' : phraseAttente(depuisMs)
            }`
          : rappelPossible
            ? 'Elle ne vous a pas encore ouvert. Vous pouvez la relancer.'
            : `Vous entrerez dès qu’elle rouvrira l’accès, sans rien avoir à refaire. ${phraseAttente(depuisMs)}`}
      </Meta>

      {rappelPossible && (
        <span style={{ display: 'block', marginTop: 8 }}>
          <Bouton
            taille="sm"
            variante="secondaire"
            disabled={envoi}
            onClick={() => void frapper()}
          >
            {envoi ? 'Envoi…' : 'La relancer'}
          </Bouton>
        </span>
      )}
    </span>
  );
}

/**
 * « Relance possible dans 40 secondes. »
 *
 * Une attente qu'on ne chiffre pas paraît infinie : sans ce décompte, la seule
 * façon de savoir si le bouton va revenir serait de rester à le regarder.
 */
function phraseAttente(depuisMs: number): string {
  const restant = Math.max(0, Math.ceil((RAPPEL_APRES_MS - depuisMs) / 1000));
  if (restant === 0) return '';
  return `Relance possible dans ${restant} seconde${restant > 1 ? 's' : ''}.`;
}
