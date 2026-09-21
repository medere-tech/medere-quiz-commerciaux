/**
 * Ce qu'une séance annonce d'elle-même : son nom, son titre, sa durée.
 *
 * **Module pur, sans Firestore et sans React.** Les deux règles qui comptent —
 * un titre jamais vide, une durée jamais inventée — sont ainsi vérifiables sans
 * monter un écran. Et surtout : `depot.ts` est un module client qui importe le
 * SDK Firestore. Tout ce qui n'a pas besoin du SDK vit ici, pour qu'un écran
 * qui ne lit rien n'embarque rien.
 */

/** Longueur maximale du nom affiché au classement. Voir `firestore.rules`. */
export const NOM_SESSION_MAX = 32;

/**
 * Ce que lit un participant quand la séance est suspendue.
 *
 * **Une constante, parce que deux écrans doivent dire exactement la même
 * chose.** L'écran du participant l'affiche ; la salle d'attente de
 * l'animatrice le répète dans sa vignette « vu par la salle ». Un miroir qui
 * montre autre chose que la réalité est pire que pas de miroir — l'animatrice
 * croirait savoir ce que sa salle a sous les yeux.
 */
export const TITRE_PAUSE_PARTICIPANT = 'Séance en pause';

/** Longueur maximale du titre de séance. Voir `firestore.rules`. */
export const TITRE_SEANCE_MAX = 60;

/** Longueur maximale de la phrase de description. Voir `firestore.rules`. */
export const DESCRIPTION_SEANCE_MAX = 160;

/**
 * Retire les caractères de contrôle et borne la longueur.
 *
 * Les règles refusent déjà les deux. On les applique ici aussi, pour que le
 * refus n'arrive jamais : un texte collé depuis un tableur porte souvent une
 * tabulation ou un retour à la ligne, et personne n'a de raison de savoir
 * pourquoi son titre est rejeté. Un nom sur deux lignes casserait de toute
 * façon la mise en page de la liste entière.
 */
function borner(texte: string, maximum: number): string {
  return Array.from(texte)
    .filter((caractere) => {
      const code = caractere.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim()
    .slice(0, maximum);
}

/** Nettoie un nom d'affichage avant de l'écrire. */
export function nomAffichable(nom: string): string {
  return borner(nom, NOM_SESSION_MAX);
}

/** Nettoie un titre de séance avant de l'écrire. */
export function titreAffichable(titre: string): string {
  return borner(titre, TITRE_SEANCE_MAX);
}

/**
 * Nettoie la phrase de description.
 *
 * **Elle peut rester vide, et c'est prévu.** Le titre suffit à annoncer une
 * séance ; la description dit ce qu'elle couvre quand Noémie a quelque chose à
 * en dire. Un champ obligatoire qu'on ne sait pas remplir se remplit mal.
 */
export function descriptionAffichable(description: string): string {
  return borner(description, DESCRIPTION_SEANCE_MAX);
}

/**
 * Le titre proposé d'emblée dans le formulaire de composition.
 *
 * **Le champ n'est jamais vide à l'ouverture.** Noémie compose le mardi pour le
 * jeudi : le jour et la date suffisent à nommer la séance tant qu'elle n'a pas
 * mieux. Elle écrase ce texte dès qu'elle a un sujet.
 */
export function titreParDefaut(instant: Date = new Date()): string {
  const jour = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(instant);

  return titreAffichable(`Séance du ${jour}`);
}

/**
 * Le titre affiché, quoi qu'il arrive.
 *
 * **Un titre vide sur un écran projeté est pire qu'un titre générique.** Si le
 * champ manque ou ne contient que des espaces, on retombe sur la date de
 * création plutôt que sur rien.
 */
export function titreDeSeance(seance: {
  titre?: string;
  creeeLeMs?: number | null;
}): string {
  const propre = titreAffichable(seance.titre ?? '');
  if (propre !== '') return propre;

  const creee = seance.creeeLeMs;
  return creee === null || creee === undefined
    ? 'Séance collective'
    : titreParDefaut(new Date(creee));
}

/**
 * Le temps de commentaire d'une question, en secondes.
 *
 * **Il ne dépend pas du chronomètre, et c'est tout l'intérêt.** Révéler la
 * bonne réponse, la commenter, répondre à une objection dans la salle : cela
 * prend le même temps qu'on ait laissé vingt secondes ou soixante pour
 * répondre. Le lot 9 doublait la durée de vote, ce qui faisait croître le
 * commentaire avec le chronomètre — une approximation que la maquette de la
 * page 7 remplace par une mesure du rythme réel.
 */
const COMMENTAIRE_SECONDES = 45;

/**
 * La durée annoncée d'une séance, en minutes.
 *
 * **Elle est calculée, jamais stockée.** Une durée écrite en base ment dès que
 * Noémie ajoute une question ou change le chronomètre, et une séance annoncée
 * vingt minutes qui en dure trente-cinq est pire qu'une séance sans durée.
 *
 * **Chaque question coûte son temps de réponse plus le temps de la
 * commenter.** Le second est fixe — voir `COMMENTAIRE_SECONDES`. Arrondi à la
 * minute, et non à cinq : « 18 min » est une estimation utile, « 20 min » est
 * la même estimation rendue plus vague sans rien gagner.
 *
 * **Zéro seconde par question n'est pas une durée nulle.** C'est « pas de
 * chronomètre », prévu par les règles : la séance se mène au rythme de la
 * parole. Aucune durée n'est alors calculable, et on rend `null` plutôt qu'un
 * nombre inventé — l'écran annoncera « libre ».
 */
export function dureeAnnonceeMinutes(seance: {
  questionIds: string[];
  dureeQuestionSecondes: number;
}): number | null {
  const questions = seance.questionIds.length;
  const parQuestion = seance.dureeQuestionSecondes;

  if (questions === 0 || parQuestion <= 0) return null;

  const minutes = Math.round((questions * (parQuestion + COMMENTAIRE_SECONDES)) / 60);

  // Une séance très courte ne s'annonce pas « 0 minute ».
  return Math.max(minutes, 1);
}

/** « 8 questions, environ 10 minutes », ou le compte seul quand rien ne cadence. */
export function resumeSeance(seance: {
  questionIds: string[];
  dureeQuestionSecondes: number;
}): string {
  const questions = seance.questionIds.length;
  const accord = questions > 1 ? 'questions' : 'question';
  const minutes = dureeAnnonceeMinutes(seance);

  return minutes === null
    ? `${questions} ${accord}, au rythme de la salle`
    : `${questions} ${accord}, environ ${minutes} minutes`;
}

/**
 * Combien de temps une séance close a réellement duré, en minutes.
 *
 * **C'est une mesure, pas une estimation**, et les deux ne se confondent pas à
 * l'écran : l'une dit « estimées », l'autre « écoulées ». Rend `null` tant que
 * la séance n'est pas close, ou si l'une des deux bornes manque — une durée
 * calculée sur une borne absente vaudrait des décennies.
 */
export function dureeEcouleeMinutes(seance: {
  ouverteLeMs: number | null;
  termineeLeMs: number | null;
}): number | null {
  const { ouverteLeMs, termineeLeMs } = seance;
  if (ouverteLeMs === null || termineeLeMs === null) return null;

  const minutes = Math.round((termineeLeMs - ouverteLeMs) / 60000);
  return minutes > 0 ? minutes : null;
}

/**
 * Le nom de l'animatrice, tel qu'elle l'a publié sur la séance.
 *
 * **Il est recopié sur le document, et c'est elle qui l'écrit.** Aller le
 * chercher dans `users/{animateurUid}` serait impossible : ce document est
 * fermé à tout le monde sauf à son propriétaire, sans exception administrateur.
 * C'est exactement le motif des marqueurs de présence — chacun publie son
 * propre nom pour la séance, personne ne lit les données privées d'un autre.
 *
 * Rend `null` plutôt qu'une chaîne vide : l'écran doit pouvoir ne pas écrire
 * « animée par » du tout, au lieu d'écrire « animée par ».
 */
export function animatricePar(seance: { animateurNom?: string }): string | null {
  const propre = nomAffichable(seance.animateurNom ?? '');
  return propre === '' ? null : propre;
}

/**
 * Quand la séance a été ouverte, en toutes lettres.
 *
 * **C'est `ouverteLe` et non `creeeLe`.** Une séance composée le mardi et
 * lancée le jeudi porte deux dates ; celle qui intéresse quelqu'un qui arrive
 * est celle de l'ouverture. Rend `null` tant que la séance n'est pas lancée :
 * une séance en attente n'a pas d'heure d'ouverture à annoncer.
 */
export function ouvertureEnToutesLettres(ouverteLeMs: number | null): string | null {
  if (ouverteLeMs === null) return null;

  const date = new Date(ouverteLeMs);
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(date);

  /*
   * **« 15 h 01 », et non « 15:01 ».**
   *
   * `Intl` rend l'heure française avec deux points — c'est ce que dit CLDR, et
   * c'est faux typographiquement : en français, l'heure se sépare par un « h ».
   * La maquette l'écrit d'ailleurs « Jeudi 14 h ». On compose donc à la main,
   * avec des espaces insécables pour que « 15 h 01 » ne se coupe jamais en fin
   * de ligne.
   */
  const heures = date.getHours();
  const minutes = date.getMinutes();
  const heure =
    minutes === 0
      ? `${heures} h`
      : `${heures} h ${String(minutes).padStart(2, '0')}`;

  return `Ouverte ${jour} à ${heure}`;
}
