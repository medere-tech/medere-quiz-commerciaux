import 'server-only';

import { exigerAdmin } from '@/lib/auth/session-serveur';
import { envServeur } from '@/lib/env/serveur';
import { firestoreAdmin } from '@/lib/firebase/admin';
import type { Formation } from '@/lib/formations/lecture';
import { identiteVisuelle } from '@/lib/formations/identite';
import { formationPrincipale } from '@/lib/formations/transverse';
import type { TypeQuestion } from '@/lib/questions/modele';
import { clefDuJour, enAssiduite, semaineDe } from '@/lib/serie/assiduite';
import { avatarOuDefaut, type CleAvatar } from '@/lib/session/avatar';
import { enEtatComplet, etatsDesQuestions, type EtatComplet } from '@/lib/serie/etats';
import { avancementParFormation, maitrise, type Maitrise } from '@/lib/serie/maitrise';
import { chargerReferentiel } from '@/lib/serveur/referentiel';
import { agregerEtats, type StatsQuestion } from '@/lib/statistiques/modele';

/**
 * Le suivi individuel, pour l'équipe pédagogique.
 *
 * **Décision du 30 septembre 2026** — voir le README. Noémie et Harry lisent la
 * maîtrise de chaque commercial, jusqu'au détail question par question, pour
 * l'accompagner. L'équipe pédagogique, ce sont les administrateurs : la liste
 * tenue par `ADMIN_EMAILS`, et aucun autre mécanisme.
 *
 * **Par le serveur, pas par les règles.** Ce module lit avec le SDK Admin, qui
 * contourne les règles Firestore. Les règles, elles, ne bougent pas : elles
 * continuent de fermer `users/{uid}` à tout client autre que son propriétaire,
 * administrateurs compris. C'est donc la **base** qui garantit qu'aucun
 * commercial ne lit un autre commercial ; ce fichier ne garantit que ce que
 * voit l'équipe pédagogique, et ses garanties sont testées par
 * `tests/serveur/maitrise-equipe.test.ts` :
 *
 * 1. **`server-only`** — le module ne part jamais au navigateur.
 * 2. **Toute fonction exportée commence par `await exigerAdmin()`**, avant la
 *    moindre lecture. Un appel sans le rôle lève `ErreurAcces`, et rien n'est lu.
 * 3. **`reponses` n'est lu que pour être compté.** La maîtrise vient des états
 *    par question — la même donnée que lit le parcours du commercial. Seule la
 *    répartition des réponses d'une question (écran 12) lit les options
 *    cochées, et n'en rend qu'un total par proposition : aucune réponse ne sort
 *    avec le nom de son auteur, ni son heure.
 * 4. **Aucun écran commercial ne l'importe** : seules les routes `admin/`.
 *
 * **La même maîtrise que celle du commercial**, calculée par les mêmes
 * fonctions (`maitrise`, `avancementParFormation`) sur les mêmes questions
 * servies. Ce que Noémie lit est ce que le commercial voit sur son accueil.
 *
 * **Les taux d'échec par question viennent d'ici aussi**, et de nulle part
 * ailleurs : la somme des états des commerciaux suivis (`agregerEtats`). La
 * liste des statistiques, l'écran d'une question et la composition d'une
 * séance lisent donc le même chiffre, sur la même population que la maîtrise
 * et que la répartition des réponses. Il ne sort de ce calcul que des totaux
 * par question, sans identifiant.
 */

export type LigneFormation = {
  formationId: string;
  nom: string;
  maitrise: Maitrise;
};

export type ResumeCommercial = {
  uid: string;
  nom: string;
  email: string;
  maitrise: Maitrise;
  /** Questions servies déjà rencontrées au moins une fois. */
  vues: number;
  /** Questions dont la dernière tentative est un échec : ce qu'« À revoir » lui propose. */
  aRevoir: number;
  /** Dernière réponse enregistrée, en millisecondes. `null` s'il n'a jamais joué. */
  derniereActiviteMs: number | null;
  parFormation: LigneFormation[];
};

export type MaitriseEquipe = {
  commerciaux: ResumeCommercial[];
  /**
   * Maîtrise d'équipe par formation : la moyenne des maîtrises individuelles,
   * commerciaux qui n'ont pas encore joué compris — à zéro. Une équipe dont la
   * moitié n'a jamais ouvert une formation ne la maîtrise pas à 90 %.
   */
  parFormation: { formationId: string; nom: string; pourcentage: number; commerciaux: number }[];
  /** Les taux d'échec par question, tirés des mêmes états. Des totaux, sans nom. */
  parQuestion: StatsQuestion[];
};

export type LigneQuestionSuivie = {
  questionId: string;
  enonce: string;
  type: TypeQuestion;
  formationId: string | null;
  formationNom: string;
  /** La forme de la formation principale, dans `public/formes/`. */
  formationFichier: string | null;
  etat: EtatComplet;
};

export type SuiviCommercial = Omit<ResumeCommercial, 'parFormation'> & {
  avatar: CleAvatar;
  /** Moyenne des maîtrises de l'équipe, lui compris, en pourcentage. */
  maitriseEquipe: number;
  /** Parmi les questions à revoir, celles ratées au moins deux fois. */
  rateesPlusieursFois: number;
  seriesTerminees: number;
  joursActifsCetteSemaine: number;
  /** La plus faible en premier. */
  parFormation: (LigneFormation & { fichier: string | null })[];
  questions: LigneQuestionSuivie[];
};

export type ResultatsQuestion = {
  questionId: string;
  enonce: string;
  type: TypeQuestion;
  statut: string;
  explication: string;
  modifieeLeMs: number | null;
  /** La formation principale, pour sa forme et son nom. */
  formation: Formation | null;
  /**
   * La somme des états des commerciaux suivis — le même calcul que la liste
   * des statistiques, pour qu'un clic ne change pas le taux sous les yeux, et
   * la même population que la répartition ci-dessous. `null` tant qu'aucun
   * commercial n'a répondu.
   */
  stats: { tentatives: number; echecs: number } | null;
  commerciaux: { uid: string; nom: string; etat: EtatComplet }[];
  /**
   * Combien de réponses ont coché chaque proposition, dans l'ordre d'affichage.
   * Un total, jamais une liste : on sait que trois réponses ont choisi « Huit
   * heures », pas qui. Les réponses de l'équipe pédagogique n'y comptent pas.
   */
  repartition: { optionId: string; libelle: string; juste: boolean; nombre: number }[];
  /** Nombre de réponses comptées dans la répartition. */
  reponsesComptees: number;
};

type Commercial = { uid: string; nom: string; email: string };

/** Les comptes suivis : tout `users/{uid}` qui n'appartient pas à l'équipe pédagogique. */
async function lesCommerciaux(): Promise<Commercial[]> {
  const equipe = new Set(envServeur.adressesAdministrateurs);
  const instantane = await firestoreAdmin().collection('users').get();

  return instantane.docs
    .map((document) => {
      const donnees = document.data();
      const email = typeof donnees.email === 'string' ? donnees.email.toLowerCase() : '';
      const nom = typeof donnees.nom === 'string' && donnees.nom.trim() ? donnees.nom : email;
      return { uid: document.id, nom, email };
    })
    .filter((commercial) => commercial.email !== '' && !equipe.has(commercial.email))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Les états des seuls commerciaux suivis, une lecture par compte, en parallèle.
 *
 * Pas de requête de groupe sur `etats` : elle ramasserait aussi les comptes de
 * l'équipe pédagogique, qui ne sont pas suivis — et qui, en recette, portent à
 * eux seuls l'essentiel des états de la base. On ne lit que ce qui s'affiche.
 */
async function lesEtatsDe(commerciaux: Commercial[]): Promise<Map<string, Map<string, EtatComplet>>> {
  const base = firestoreAdmin();
  const lots = await Promise.all(
    commerciaux.map((commercial) => base.collection('users').doc(commercial.uid).collection('etats').get()),
  );

  return new Map(
    commerciaux.map((commercial, index) => [
      commercial.uid,
      new Map(lots[index]!.docs.map((document) => [document.id, enEtatComplet(document.id, document.data())])),
    ]),
  );
}

/** L'état d'une seule question, pour chaque commercial suivi, en un aller-retour. */
async function lesEtatsDeLaQuestion(
  commerciaux: Commercial[],
  questionId: string,
): Promise<Map<string, Map<string, EtatComplet>>> {
  if (commerciaux.length === 0) return new Map();
  const base = firestoreAdmin();
  const documents = await base.getAll(
    ...commerciaux.map((commercial) =>
      base.collection('users').doc(commercial.uid).collection('etats').doc(questionId),
    ),
  );

  return new Map(
    commerciaux.map((commercial, index) => {
      const document = documents[index]!;
      const etats = new Map<string, EtatComplet>();
      if (document.exists) etats.set(questionId, enEtatComplet(questionId, document.data() ?? {}));
      return [commercial.uid, etats];
    }),
  );
}

function resumer(
  commercial: Commercial,
  etatsDuCompte: Map<string, EtatComplet>,
  referentiel: Awaited<ReturnType<typeof chargerReferentiel>>,
): ResumeCommercial {
  const servies = referentiel.questions.map((question) => question.id);
  const etats = etatsDesQuestions(servies, etatsDuCompte);
  const dates = etats.map((etat) => etat.vueLeMs).filter((ms): ms is number => ms !== null);

  return {
    ...commercial,
    maitrise: maitrise(etats),
    vues: etats.filter((etat) => etat.dejaVue).length,
    aRevoir: etats.filter((etat) => etat.derniereRatee).length,
    derniereActiviteMs: dates.length > 0 ? Math.max(...dates) : null,
    parFormation: avancementParFormation(referentiel.formations, referentiel.questions, etats).map(
      (avancement) => ({
        formationId: avancement.formation.id,
        nom: avancement.formation.nom,
        maitrise: avancement.maitrise,
      }),
    ),
  };
}

/** La liste des commerciaux, et la maîtrise d'équipe par formation. */
export async function chargerMaitriseEquipe(): Promise<MaitriseEquipe> {
  await exigerAdmin();

  // Le référentiel part tout de suite ; les états attendent la liste des
  // commerciaux, qui dit quels comptes lire.
  const referentielEnCours = chargerReferentiel();
  const commerciaux = await lesCommerciaux();
  const [etats, referentiel] = await Promise.all([lesEtatsDe(commerciaux), referentielEnCours]);

  const resumes = commerciaux.map((commercial) =>
    resumer(commercial, etats.get(commercial.uid) ?? new Map(), referentiel),
  );

  const parFormation = referentiel.formations
    .map((formation) => {
      const pourcentages = resumes.map(
        (resume) =>
          resume.parFormation.find((ligne) => ligne.formationId === formation.id)?.maitrise
            .pourcentage ?? 0,
      );
      return {
        formationId: formation.id,
        nom: formation.nom,
        commerciaux: pourcentages.length,
        pourcentage:
          pourcentages.length === 0
            ? 0
            : Math.round(pourcentages.reduce((somme, valeur) => somme + valeur, 0) / pourcentages.length),
      };
    })
    .filter((ligne) => referentiel.questions.some((question) => question.formationIds.includes(ligne.formationId)));

  return { commerciaux: resumes, parFormation, parQuestion: agregerEtats(etats.values()) };
}

/**
 * Les taux d'échec par question, seuls — pour la composition d'une séance, qui
 * n'affiche pas la maîtrise. Les mêmes lectures et le même calcul que
 * `chargerMaitriseEquipe` : deux écrans ne peuvent pas lire deux taux.
 */
export async function chargerTauxQuestions(): Promise<StatsQuestion[]> {
  await exigerAdmin();

  const etats = await lesEtatsDe(await lesCommerciaux());
  return agregerEtats(etats.values());
}

/**
 * Un commercial, question par question. `null` s'il n'est pas suivi.
 *
 * Les états de toute l'équipe sont lus, pas seulement les siens : la maquette
 * place sa maîtrise à côté de celle de l'équipe, et cette moyenne se calcule
 * comme sur les statistiques — commerciaux qui n'ont pas joué compris, à zéro.
 */
export async function chargerSuiviCommercial(uid: string): Promise<SuiviCommercial | null> {
  await exigerAdmin();

  const base = firestoreAdmin();
  // Le référentiel et le document du compte partent tout de suite ; les états
  // attendent la liste des commerciaux, qui dit quels comptes lire.
  const referentielEnCours = chargerReferentiel();
  const [commerciaux, document] = await Promise.all([
    lesCommerciaux(),
    base.collection('users').doc(uid).get(),
  ]);

  const commercial = commerciaux.find((candidat) => candidat.uid === uid);
  if (!commercial) {
    await referentielEnCours;
    return null;
  }

  const [etatsParCompte, referentiel] = await Promise.all([lesEtatsDe(commerciaux), referentielEnCours]);
  const etatsDuCompte = etatsParCompte.get(uid) ?? new Map<string, EtatComplet>();

  const equipe = commerciaux.map(
    (membre) => resumer(membre, etatsParCompte.get(membre.uid) ?? new Map(), referentiel).maitrise.pourcentage,
  );
  const resume = resumer(commercial, etatsDuCompte, referentiel);
  const etats = etatsDesQuestions(
    referentiel.questions.map((question) => question.id),
    etatsDuCompte,
  );

  const formations = new Map(referentiel.formations.map((formation) => [formation.id, formation]));
  const fichier = (formationId: string | null) => {
    const formation = formationId ? formations.get(formationId) : undefined;
    return formation ? identiteVisuelle(formation).fichier : null;
  };

  const donnees = document.data() ?? {};
  const semaine = semaineDe(clefDuJour(new Date()));
  const joursActifs = enAssiduite(donnees.assiduite).semaine.filter((jour) => semaine.includes(jour));
  const rateesPlusieursFois = etats.filter(
    (etat) => etat.derniereRatee && etat.tentatives - etat.reussies >= 2,
  );

  return {
    ...resume,
    avatar: avatarOuDefaut(donnees.avatar),
    maitriseEquipe: Math.round(equipe.reduce((somme, valeur) => somme + valeur, 0) / equipe.length),
    rateesPlusieursFois: rateesPlusieursFois.length,
    seriesTerminees: typeof donnees.seriesTerminees === 'number' ? donnees.seriesTerminees : 0,
    joursActifsCetteSemaine: joursActifs.length,
    parFormation: resume.parFormation.map((ligne) => ({ ...ligne, fichier: fichier(ligne.formationId) })),
    questions: referentiel.questions.map((question, index) => {
      const formationId = formationPrincipale(question.formationIds) ?? null;
      return {
        questionId: question.id,
        enonce: question.enonce,
        type: question.type,
        formationId,
        formationNom: formationId ? (formations.get(formationId)?.nom ?? '') : '',
        formationFichier: fichier(formationId),
        etat: etats[index]!,
      };
    }),
  };
}

/** Une question, commercial par commercial. `null` si elle n'est pas servie. */
export async function chargerResultatsQuestion(questionId: string): Promise<ResultatsQuestion | null> {
  await exigerAdmin();

  const base = firestoreAdmin();
  const [commerciaux, referentiel, document] = await Promise.all([
    lesCommerciaux(),
    chargerReferentiel(),
    base.collection('questions').doc(questionId).get(),
  ]);
  const question = referentiel.questions.find((candidate) => candidate.id === questionId);
  if (!question) return null;

  const donnees = document.data() ?? {};
  // Les états et les réponses dépendent tous deux de la liste des commerciaux,
  // pas l'un de l'autre : ils partent ensemble.
  const [etats, repartition] = await Promise.all([
    lesEtatsDeLaQuestion(commerciaux, questionId),
    repartitionDesReponses(questionId, commerciaux, donnees),
  ]);

  const formationId = formationPrincipale(question.formationIds);
  const modifieeLe = donnees.modifieeLe as { toMillis?: () => number } | undefined;
  const [stats] = agregerEtats(etats.values());

  return {
    questionId,
    enonce: question.enonce,
    type: question.type,
    statut: question.statut,
    explication: typeof donnees.explication === 'string' ? donnees.explication : '',
    modifieeLeMs: typeof modifieeLe?.toMillis === 'function' ? modifieeLe.toMillis() : null,
    formation: referentiel.formations.find((formation) => formation.id === formationId) ?? null,
    stats: stats ? { tentatives: stats.tentatives, echecs: stats.echecs } : null,
    commerciaux: commerciaux.map((commercial) => ({
      uid: commercial.uid,
      nom: commercial.nom,
      etat: etatsDesQuestions([questionId], etats.get(commercial.uid) ?? new Map())[0]!,
    })),
    ...repartition,
  };
}

/**
 * Les options cochées, comptées par proposition.
 *
 * Une requête par commercial, sur sa propre collection de réponses : le filtre
 * sur `questionId` s'appuie sur l'index automatique de la collection, là où
 * une requête de groupe en exigerait un à créer. Dix commerciaux, dix lectures
 * courtes. Chaque réponse est réduite à ses options avant de quitter la
 * boucle : rien de ce qui est lu ne remonte avec son auteur.
 */
async function repartitionDesReponses(
  questionId: string,
  commerciaux: Commercial[],
  question: Record<string, unknown>,
): Promise<Pick<ResultatsQuestion, 'repartition' | 'reponsesComptees'>> {
  const ordre = Array.isArray(question.ordreOptions) ? (question.ordreOptions as string[]) : [];
  const libelles = (question.options ?? {}) as Record<string, unknown>;
  const bonnes = new Set(Array.isArray(question.bonnesReponses) ? (question.bonnesReponses as string[]) : []);

  const lots = await Promise.all(
    commerciaux.map((commercial) =>
      firestoreAdmin()
        .collection('users')
        .doc(commercial.uid)
        .collection('reponses')
        .where('questionId', '==', questionId)
        .get(),
    ),
  );

  const nombres = new Map<string, number>();
  let reponsesComptees = 0;
  for (const lot of lots) {
    for (const reponse of lot.docs) {
      const choisies = reponse.get('optionsChoisies');
      if (!Array.isArray(choisies)) continue;
      reponsesComptees += 1;
      for (const option of new Set(choisies as string[])) nombres.set(option, (nombres.get(option) ?? 0) + 1);
    }
  }

  return {
    reponsesComptees,
    repartition: ordre.map((optionId) => ({
      optionId,
      libelle: typeof libelles[optionId] === 'string' ? (libelles[optionId] as string) : optionId,
      juste: bonnes.has(optionId),
      nombre: nombres.get(optionId) ?? 0,
    })),
  };
}
