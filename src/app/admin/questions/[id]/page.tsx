'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Route } from 'next';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import {
  Bouton,
  Carte,
  Champ,
  EtiquetteStatut,
  Meta,
  Onglets,
  Selecteur,
  TitreSection,
  ZoneDeTexte,
} from '@/composants/ds/primitives';
import { EtatErreur, Squelettes } from '@/composants/ds/etats';
import { Icone } from '@/composants/ds/Icone';
import { SelecteurFormations } from '@/composants/admin/SelecteurFormations';
import {
  DIFFICULTES,
  LIBELLES_DIFFICULTE,
  LIBELLES_TYPE,
  PLAFONDS,
  TYPES_QUESTION,
  accepteUnContexte,
  brouillonVierge,
  type BrouillonQuestion,
  type Difficulte,
  type StatutQuestion,
  type TypeQuestion,
} from '@/lib/questions/modele';
import { messagePour, validerQuestion, type ErreurChamp } from '@/lib/questions/validation';
import { chargerFormations, type Formation } from '@/lib/formations/depot';
import {
  chargerQuestion,
  creerQuestion,
  enregistrerQuestion,
  supprimerQuestion,
} from '@/lib/questions/depot';
import { authentification } from '@/lib/firebase/client';
import { echecDeLecture, type EchecDeLecture } from '@/lib/firebase/erreurs';

/**
 * 07 · Éditeur de question.
 *
 * Trois formats, un seul écran : le contexte n'apparaît que pour les mises en
 * situation, le marqueur des réponses change de forme selon qu'on en attend
 * une ou plusieurs.
 *
 * L'enregistrement est refusé ici, avec un message par champ, avant que
 * Firestore n'ait à le refuser. Une erreur de permission renvoyée à quelqu'un
 * qui a simplement oublié un champ est incompréhensible.
 */

const OPTIONS_VRAI_FAUX = { vrai: 'Vrai', faux: 'Faux' };

function identifiantLibre(existants: string[]): string {
  let numero = existants.length + 1;
  while (existants.includes(`o${numero}`)) numero += 1;
  return `o${numero}`;
}

export default function PageEditeur() {
  const router = useRouter();
  const parametres = useParams<{ id: string }>();
  const requete = useSearchParams();

  /**
   * Adresse de retour vers la banque, telle qu'on l'a quittée : filtre,
   * recherche, tri, nombre de lignes chargées, et la question à remettre sous
   * les yeux. La banque la fabrique et la passe en paramètre ; l'éditeur ne
   * fait que la rendre. Sans elle, « Revenir » rouvre une liste par défaut et
   * il faut tout refiltrer.
   */
  const retour = requete.get('retour');
  const versLaBanque = (retour ? `/admin/questions?${retour}` : '/admin/questions') as Route;
  const identifiant = parametres.id;
  const creation = identifiant === 'nouvelle';

  const [brouillon, setBrouillon] = useState<BrouillonQuestion>(brouillonVierge());
  const [formations, setFormations] = useState<Formation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [questionAbsente, setQuestionAbsente] = useState(false);
  const [erreurChargement, setErreurChargement] = useState<EchecDeLecture>();
  const [erreurEnregistrement, setErreurEnregistrement] = useState<string>();
  const [erreurs, setErreurs] = useState<ErreurChamp[]>([]);
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    let vivant = true;

    async function charger() {
      try {
        const [listeFormations, question] = await Promise.all([
          chargerFormations(),
          creation ? Promise.resolve(null) : chargerQuestion(identifiant),
        ]);
        if (!vivant) return;
        setFormations(listeFormations);

        if (!creation) {
          if (!question) {
            setQuestionAbsente(true);
          } else {
            setBrouillon({
              type: question.type,
              contexte: question.contexte,
              enonce: question.enonce,
              options: question.options,
              ordreOptions: question.ordreOptions,
              bonnesReponses: question.bonnesReponses,
              explication: question.explication,
              formationIds: question.formationIds,
              theme: question.theme,
              difficulte: question.difficulte,
              statut: question.statut,
              sourceFiche: question.sourceFiche,
              sourceVersion: question.sourceVersion,
            });
          }
        }
      } catch (probleme) {
        if (!vivant) return;
        // Une création ne lit aucune question : dire « question introuvable »
        // ici enverrait chercher un document qui n'a jamais existé.
        setErreurChargement(
          echecDeLecture(
            probleme,
            creation
              ? "le référentiel des formations, sans lequel l'éditeur ne peut pas s'ouvrir"
              : 'la question et le référentiel des formations',
          ),
        );
      } finally {
        if (vivant) setChargement(false);
      }
    }

    void charger();
    return () => {
      vivant = false;
    };
  }, [identifiant, creation]);

  const modifier = (champs: Partial<BrouillonQuestion>) =>
    setBrouillon((precedent) => ({ ...precedent, ...champs }));

  function changerType(type: TypeQuestion) {
    if (type === 'vf') {
      // Le format vrai/faux impose ses deux options : on ne demande pas à
      // Noémie de les retaper à chaque fois.
      modifier({
        type,
        options: { ...OPTIONS_VRAI_FAUX },
        ordreOptions: ['vrai', 'faux'],
        bonnesReponses: brouillon.bonnesReponses.filter((identifiantOption) =>
          ['vrai', 'faux'].includes(identifiantOption),
        ),
        contexte: '',
      });
      return;
    }
    modifier({ type, contexte: accepteUnContexte(type) ? brouillon.contexte : '' });
  }

  function ajouterOption() {
    const nouvelIdentifiant = identifiantLibre(brouillon.ordreOptions);
    modifier({
      options: { ...brouillon.options, [nouvelIdentifiant]: '' },
      ordreOptions: [...brouillon.ordreOptions, nouvelIdentifiant],
    });
  }

  function retirerOption(identifiantOption: string) {
    const options = { ...brouillon.options };
    delete options[identifiantOption];
    modifier({
      options,
      ordreOptions: brouillon.ordreOptions.filter((autre) => autre !== identifiantOption),
      bonnesReponses: brouillon.bonnesReponses.filter((autre) => autre !== identifiantOption),
    });
  }

  function basculerBonneReponse(identifiantOption: string) {
    const deja = brouillon.bonnesReponses.includes(identifiantOption);
    // Vrai ou faux : une seule bonne réponse, la sélection se remplace.
    if (brouillon.type === 'vf') {
      modifier({ bonnesReponses: deja ? [] : [identifiantOption] });
      return;
    }
    modifier({
      bonnesReponses: deja
        ? brouillon.bonnesReponses.filter((autre) => autre !== identifiantOption)
        : [...brouillon.bonnesReponses, identifiantOption],
    });
  }

  async function enregistrer(statut: StatutQuestion) {
    setErreurEnregistrement(undefined);
    const candidat: BrouillonQuestion = { ...brouillon, statut };
    const resultat = validerQuestion(candidat);

    if (!resultat.valide) {
      setErreurs(resultat.erreurs);
      // Le récapitulatif est en haut de l'écran : sur un formulaire long, un
      // message affiché hors du champ de vision passerait inaperçu.
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setErreurs([]);
    setEnregistrement(true);

    try {
      const utilisateur = authentification().currentUser;
      if (!utilisateur) throw new Error('session absente');

      if (creation) {
        const nouvel = await creerQuestion(resultat.question, utilisateur.uid);
        // On reste sur la question créée, en gardant de quoi revenir.
        router.replace(
          (retour
            ? `/admin/questions/${nouvel}?retour=${encodeURIComponent(retour)}`
            : `/admin/questions/${nouvel}`) as Route,
        );
      } else {
        await enregistrerQuestion(identifiant, resultat.question);
        modifier({ statut });
      }
      setBrouillon((precedent) => ({ ...precedent, statut }));
    } catch {
      setErreurEnregistrement(
        "L'enregistrement a échoué. Votre saisie est toujours à l'écran : réessayez, rien n'est perdu.",
      );
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer() {
    if (creation) return;
    const confirme = window.confirm(
      'Supprimer cette question ? Les réponses déjà données par les commerciaux restent enregistrées, mais la question ne sortira plus dans aucune série.',
    );
    if (!confirme) return;

    try {
      await supprimerQuestion(identifiant);
      router.push(versLaBanque);
    } catch {
      setErreurEnregistrement("La suppression a échoué. La question est toujours en place.");
    }
  }

  const controles = useMemo(() => {
    const options = Object.entries(brouillon.options);
    return [
      ['Énoncé renseigné', brouillon.enonce.trim().length > 0],
      ['Au moins deux réponses', options.length >= 2],
      ['Tous les libellés remplis', options.every(([, libelle]) => libelle.trim().length > 0)],
      ['Bonne réponse désignée', brouillon.bonnesReponses.length > 0],
      ['Formation rattachée', brouillon.formationIds.length > 0],
      ['Explication rédigée', brouillon.explication.trim().length > 0],
    ] as const;
  }, [brouillon]);

  if (chargement) {
    return (
      <div style={{ padding: '36px 40px' }}>
        <Squelettes lignes={4} />
      </div>
    );
  }

  if (questionAbsente) {
    return (
      <div style={{ padding: '36px 40px' }}>
        <EtatErreur
          titre="Question introuvable"
          texte="Cette question n'existe plus. Elle a peut-être été supprimée depuis un autre onglet."
          action={
            <Bouton variante="secondaire" onClick={() => router.push(versLaBanque)}>
              Revenir à la banque
            </Bouton>
          }
        />
      </div>
    );
  }

  if (erreurChargement) {
    return (
      <div style={{ padding: '36px 40px' }}>
        <EtatErreur
          titre="Chargement impossible"
          texte={erreurChargement.texte}
          action={
            erreurChargement.reessayable ? (
              <Bouton
                variante="secondaire"
                iconeGauche={<Icone nom="refresh" taille={16} />}
                onClick={() => window.location.reload()}
              >
                Réessayer
              </Bouton>
            ) : (
              <Bouton variante="secondaire" onClick={() => router.push(versLaBanque)}>
                Revenir à la banque
              </Bouton>
            )
          }
        />
      </div>
    );
  }

  const multiple = brouillon.type !== 'vf';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: 'none',
          padding: '28px 40px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-5)',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 30,
              lineHeight: 1.14,
              color: 'var(--text-heading)',
            }}
          >
            {creation ? 'Nouvelle question' : 'Modifier une question'}
          </h1>
          <span style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 8, alignItems: 'center' }}>
            <EtiquetteStatut ton={brouillon.statut === 'publiee' ? 'publiee' : 'brouillon'}>
              {brouillon.statut === 'publiee' ? 'Publiée' : 'Brouillon'}
            </EtiquetteStatut>
            <Meta style={{ fontSize: 12 }}>
              {brouillon.statut === 'publiee'
                ? 'Cette question entre dans les séries.'
                : "Un brouillon n'entre dans aucune série."}
            </Meta>
          </span>
        </div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <Bouton variante="fantome" taille="lg" onClick={() => router.push(versLaBanque)}>
            Revenir
          </Bouton>
          {!creation && (
            <Bouton variante="fantome" taille="lg" onClick={() => void supprimer()}>
              Supprimer
            </Bouton>
          )}
          <Bouton
            variante="secondaire"
            taille="lg"
            disabled={enregistrement}
            onClick={() => void enregistrer('brouillon')}
          >
            Enregistrer le brouillon
          </Bouton>
          <Bouton taille="lg" disabled={enregistrement} onClick={() => void enregistrer('publiee')}>
            Publier
          </Bouton>
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 372px',
          gap: 'var(--space-8)',
          padding: '0 40px 40px',
          boxSizing: 'border-box',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {erreurEnregistrement && (
            <EtatErreur titre="Enregistrement interrompu" texte={erreurEnregistrement} />
          )}

          {erreurs.length > 0 && (
            <EtatErreur
              titre={
                erreurs.length === 1
                  ? 'Un champ empêche l’enregistrement'
                  : `${erreurs.length} champs empêchent l’enregistrement`
              }
              texte="Rien n'a été enregistré. Corrigez ce qui est signalé ci-dessous, votre saisie est conservée."
            />
          )}

          <div>
            <span
              style={{
                display: 'block',
                fontSize: 'var(--body-sm-size)',
                fontWeight: 600,
                color: 'var(--text-heading)',
                marginBottom: 8,
              }}
            >
              Format de question
            </span>
            <Onglets
              items={TYPES_QUESTION.map((valeur) => ({ valeur, libelle: LIBELLES_TYPE[valeur] }))}
              valeur={brouillon.type}
              onChange={changerType}
            />
            <Meta style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              Le format détermine les champs ci-dessous. La mise en situation ajoute un contexte.
            </Meta>
          </div>

          <SelecteurFormations
            formations={formations}
            selection={brouillon.formationIds}
            onChange={(formationIds) => modifier({ formationIds })}
            erreur={messagePour(erreurs, 'formationIds')}
          />

          {accepteUnContexte(brouillon.type) && (
            <ZoneDeTexte
              label="Contexte de la mise en situation"
              value={brouillon.contexte}
              onChange={(contexte) => modifier({ contexte })}
              erreur={messagePour(erreurs, 'contexte')}
              aide={`La scène que le commercial lit avant de répondre. ${brouillon.contexte.length} caractères sur ${PLAFONDS.contexte}.`}
              lignes={3}
              placeholder="Un cabinet dentaire vous appelle pour inscrire trois personnes…"
            />
          )}

          <ZoneDeTexte
            label="Énoncé"
            value={brouillon.enonce}
            onChange={(enonce) => modifier({ enonce })}
            erreur={messagePour(erreurs, 'enonce')}
            aide={`${brouillon.enonce.length} caractères sur ${PLAFONDS.enonce}.`}
            lignes={2}
            placeholder="Quels professionnels peuvent s'inscrire à cette formation ?"
          />

          <div>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 10 }}>
              <span style={{ fontSize: 'var(--body-sm-size)', fontWeight: 600, color: 'var(--text-heading)' }}>
                Réponses
              </span>
              <Meta style={{ fontSize: 12 }}>
                {multiple
                  ? 'Cochez toutes les réponses justes. Une réponse partielle est comptée fausse.'
                  : 'Une seule réponse juste.'}
              </Meta>
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {brouillon.ordreOptions.map((identifiantOption) => {
                const juste = brouillon.bonnesReponses.includes(identifiantOption);
                return (
                  <span
                    key={identifiantOption}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={juste}
                      aria-label={`Marquer « ${brouillon.options[identifiantOption] || 'cette réponse'} » comme juste`}
                      onClick={() => basculerBonneReponse(identifiantOption)}
                      style={{
                        width: 24,
                        height: 24,
                        flex: 'none',
                        borderRadius: multiple ? 'var(--radius-sm)' : 999,
                        background: juste ? 'var(--status-success)' : 'var(--surface-card)',
                        border: '1px solid ' + (juste ? 'var(--status-success)' : 'var(--border-default)'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      {juste && <Icone nom="check" taille={13} epaisseur={2.3} />}
                    </button>
                    <span style={{ flex: 1 }}>
                      <Champ
                        value={brouillon.options[identifiantOption] ?? ''}
                        onChange={(libelle) =>
                          modifier({
                            options: { ...brouillon.options, [identifiantOption]: libelle },
                          })
                        }
                        placeholder="Libellé de la réponse"
                        disabled={brouillon.type === 'vf'}
                      />
                    </span>
                    {brouillon.type !== 'vf' && (
                      <button
                        type="button"
                        aria-label="Retirer cette réponse"
                        onClick={() => retirerOption(identifiantOption)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: 4,
                          color: 'var(--neutral-50)',
                          display: 'flex',
                        }}
                      >
                        <Icone nom="trash" taille={16} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            {(messagePour(erreurs, 'options') || messagePour(erreurs, 'bonnesReponses')) && (
              <span
                style={{
                  display: 'block',
                  marginTop: 8,
                  fontSize: 'var(--body-xs-size)',
                  color: 'var(--status-danger-texte)',
                }}
              >
                {messagePour(erreurs, 'options') ?? messagePour(erreurs, 'bonnesReponses')}
              </span>
            )}

            {brouillon.type !== 'vf' && (
              <button
                type="button"
                onClick={ajouterOption}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  marginTop: 12,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--body-sm-size)',
                  fontWeight: 600,
                  color: 'var(--accent-primary)',
                }}
              >
                <Icone nom="plus" taille={15} />
                Ajouter une réponse
              </button>
            )}
          </div>

          <ZoneDeTexte
            label="Explication montrée après la réponse"
            value={brouillon.explication}
            onChange={(explication) => modifier({ explication })}
            erreur={messagePour(erreurs, 'explication')}
            aide={`Elle s'affiche même quand la réponse est juste. ${brouillon.explication.length} caractères sur ${PLAFONDS.explication}.`}
            lignes={3}
            placeholder="Expliquez pourquoi cette réponse est la bonne, en une ou deux phrases."
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <Champ
              label="Thème"
              value={brouillon.theme}
              onChange={(theme) => modifier({ theme })}
              erreur={messagePour(erreurs, 'theme')}
              aide={erreurs.length === 0 ? 'Sert à filtrer la banque.' : undefined}
              placeholder="reglementaire, formats, parcours…"
            />
            <Selecteur
              label="Difficulté"
              value={String(brouillon.difficulte)}
              onChange={(valeur) => modifier({ difficulte: Number(valeur) as Difficulte })}
              options={DIFFICULTES.map((valeur) => ({
                valeur: String(valeur),
                libelle: LIBELLES_DIFFICULTE[valeur],
              }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <Champ
              label="Fiche d'argumentaire (facultatif)"
              value={brouillon.sourceFiche}
              onChange={(sourceFiche) => modifier({ sourceFiche })}
              erreur={messagePour(erreurs, 'sourceFiche')}
              placeholder="Argumentaire Parodontie"
            />
            <Champ
              label="Version de la fiche (facultatif)"
              value={brouillon.sourceVersion}
              onChange={(sourceVersion) => modifier({ sourceVersion })}
              erreur={messagePour(erreurs, 'sourceVersion')}
              aide="Pour retrouver les questions à relire quand la fiche change."
              placeholder="v3, 2026-09-01…"
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Carte rayon="var(--radius-xl)" rembourrage={22}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Icone nom="eye" taille={16} couleur="var(--neutral-60)" />
              <span style={{ fontSize: 'var(--body-sm-size)', fontWeight: 600, color: 'var(--text-heading)' }}>
                Aperçu commercial
              </span>
            </span>

            {accepteUnContexte(brouillon.type) && brouillon.contexte.trim().length > 0 && (
              <span
                style={{
                  display: 'block',
                  marginBottom: 12,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-sunken)',
                  fontSize: 'var(--body-sm-size)',
                  lineHeight: 1.55,
                  color: 'var(--neutral-70)',
                }}
              >
                {brouillon.contexte}
              </span>
            )}

            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                lineHeight: 1.22,
                color: 'var(--text-heading)',
              }}
            >
              {brouillon.enonce.trim().length > 0 ? brouillon.enonce : 'Votre énoncé apparaîtra ici.'}
            </span>
            <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              {multiple ? 'Plusieurs réponses possibles.' : 'Une seule réponse.'}
            </span>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {brouillon.ordreOptions.map((identifiantOption, index) => (
                <span
                  key={identifiantOption}
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    alignItems: 'flex-start',
                    padding: '12px 14px',
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-card-sm)',
                  }}
                >
                  <span
                    style={{
                      flex: 'none',
                      width: 26,
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: multiple ? 'var(--radius-sm)' : 999,
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 'var(--body-sm-size)', lineHeight: 1.5 }}>
                    {brouillon.options[identifiantOption] || 'Libellé à écrire'}
                  </span>
                </span>
              ))}
            </div>
          </Carte>

          <Carte rayon="var(--radius-lg)" rembourrage="18px 20px" elevation="petite">
            <TitreSection>Avant d’enregistrer</TitreSection>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {controles.map(([libelle, fait]) => (
                <span key={libelle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      flex: 'none',
                      borderRadius: 999,
                      background: fait ? 'var(--status-success)' : 'rgba(194,66,66,0.11)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icone
                      nom={fait ? 'check' : 'alert'}
                      taille={11}
                      epaisseur={2.3}
                      couleur={fait ? '#fff' : 'var(--status-danger)'}
                    />
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--body-sm-size)',
                      color: fait ? 'var(--neutral-70)' : 'var(--status-danger-texte)',
                    }}
                  >
                    {libelle}
                  </span>
                </span>
              ))}
            </div>
            <Meta style={{ display: 'block', marginTop: 14, fontSize: 12 }}>
              Ces six points valent aussi pour un brouillon : les règles de sécurité les vérifient à
              chaque enregistrement, publication ou non.
            </Meta>
          </Carte>
        </div>
      </div>
    </div>
  );
}
