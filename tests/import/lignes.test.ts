import { describe, expect, it } from 'vitest';

import { lireCollage } from '@/lib/import/collage';
import {
  analyserLigne,
  indexerFormations,
  ligneVierge,
  signalerDoublons,
} from '@/lib/import/lignes';
import type { Formation } from '@/lib/formations/depot';
import { PLAFONDS } from '@/lib/questions/modele';

/**
 * Ce que ces tests protègent : la traduction d'une cellule vers le modèle, et
 * le fait que la validité, elle, ne soit jamais réécrite ici. Une ligne
 * refusée par l'éditeur doit être refusée par l'import, avec le même message.
 */

const FORMATIONS: Formation[] = [
  {
    id: 'recAAA',
    nom: 'Urgences au cabinet dentaire',
    numeroActionDpc: '92622525478',
    cibles: ['Chirurgien dentiste'],
    format: 'E-Learning',
    modalite: '',
    dureeTotale: '8 h',
    urlWebflow: '',
    blocsCertification: [],
    actif: true,
  },
  {
    id: 'recBBB',
    nom: 'Plaies et cicatrisation',
    numeroActionDpc: '92622325040',
    cibles: ['Médecin généraliste'],
    format: 'Présentiel',
    modalite: '',
    dureeTotale: '4 h',
    urlWebflow: '',
    blocsCertification: [],
    actif: false,
  },
];

const index = indexerFormations(FORMATIONS);

/** Une ligne complète et correcte, dont chaque test dérive sa variante. */
function ligneCorrecte(modifications: Record<string, string> = {}) {
  const ligne = ligneVierge(2);
  Object.assign(ligne.valeurs, {
    format: 'choix multiples',
    enonce: 'Quels publics peuvent suivre cette formation ?',
    reponses: 'Chirurgiens-dentistes|Assistants dentaires|Prothésistes',
    bonnesReponses: '1|2',
    explication: 'Les deux premiers publics sont accrédités, le troisième non.',
    formations: 'Urgences au cabinet dentaire',
    theme: 'publics',
    ...modifications,
  });
  return ligne;
}

describe('analyserLigne — traduction', () => {
  it('accepte une ligne complète et la rend prête à écrire', () => {
    const analyse = analyserLigne(ligneCorrecte(), index);

    expect(analyse.erreurs).toEqual([]);
    expect(analyse.question).not.toBeNull();
    expect(analyse.question?.enonce).toBe('Quels publics peuvent suivre cette formation ?');
    expect(analyse.question?.ordreOptions).toEqual(['o1', 'o2', 'o3']);
    expect(analyse.question?.bonnesReponses).toEqual(['o1', 'o2']);
  });

  it('importe toujours en brouillon, jamais publié', () => {
    // Le statut n'est pas une colonne : un lot produit en masse se relit.
    const analyse = analyserLigne(ligneCorrecte(), index);

    expect(analyse.question?.statut).toBe('brouillon');
  });

  it('lit les trois formats en français comme en abrégé', () => {
    for (const [ecrit, attendu] of [
      ['vrai ou faux', 'vf'],
      ['VF', 'vf'],
      ['Choix multiples', 'qcm'],
      ['qcm', 'qcm'],
      ['Mise en situation', 'scenario'],
    ] as const) {
      const ligne = ligneCorrecte({
        format: ecrit,
        contexte: 'Un cabinet vous appelle.',
        reponses: 'Oui|Non',
        bonnesReponses: '1',
      });
      expect(analyserLigne(ligne, index).question?.type).toBe(attendu);
    }
  });

  it('pardonne le singulier et le tiret bas d’un format écrit à la main', () => {
    // « choix_multiple » ne laisse aucun doute sur l'intention : le refuser
    // ferait une ligne rouge pour une lettre.
    expect(analyserLigne(ligneCorrecte({ format: 'choix_multiple' }), index).question?.type)
      .toBe('qcm');
  });

  it('nomme le format fautif et rappelle les valeurs acceptées', () => {
    const analyse = analyserLigne(ligneCorrecte({ format: 'choix unique' }), index);

    const erreur = analyse.erreurs.find((e) => e.colonne === 'format');
    expect(erreur?.message).toContain('choix unique');
    expect(erreur?.message).toContain('choix multiples');
  });

  it('donne ses deux options à un vrai ou faux dont la colonne réponses est vide', () => {
    const analyse = analyserLigne(
      ligneCorrecte({ format: 'vrai ou faux', reponses: '', bonnesReponses: 'Vrai' }),
      index,
    );

    expect(analyse.erreurs).toEqual([]);
    expect(analyse.question?.options).toEqual({ o1: 'Vrai', o2: 'Faux' });
    expect(analyse.question?.bonnesReponses).toEqual(['o1']);
  });

  it('désigne une bonne réponse par son numéro comme par son libellé', () => {
    const parNumero = analyserLigne(ligneCorrecte({ bonnesReponses: '2' }), index);
    const parLibelle = analyserLigne(
      ligneCorrecte({ bonnesReponses: 'assistants dentaires' }),
      index,
    );

    expect(parNumero.question?.bonnesReponses).toEqual(['o2']);
    // Sans accent ni casse : le tableur ne recopie pas au caractère près.
    expect(parLibelle.question?.bonnesReponses).toEqual(['o2']);
  });

  it('ne fend pas un libellé de réponse qui contient une virgule', () => {
    // « Chirurgiens-dentistes, assistants dentaires » est une seule réponse.
    const analyse = analyserLigne(
      ligneCorrecte({
        reponses: 'Chirurgiens-dentistes, assistants dentaires|Prothésistes',
        bonnesReponses: 'Chirurgiens-dentistes, assistants dentaires',
      }),
      index,
    );

    expect(analyse.erreurs).toEqual([]);
    expect(analyse.question?.bonnesReponses).toEqual(['o1']);
  });

  it('signale une bonne réponse qui ne correspond à aucune option', () => {
    const analyse = analyserLigne(ligneCorrecte({ bonnesReponses: '6 heures' }), index);

    const erreur = analyse.erreurs.find((e) => e.colonne === 'bonnesReponses');
    expect(erreur?.message).toContain('6 heures');
  });

  it('retrouve une formation par son nom, son numéro DPC ou son identifiant', () => {
    for (const ecrit of ['Urgences au cabinet dentaire', '92622525478', 'recAAA']) {
      const analyse = analyserLigne(ligneCorrecte({ formations: ecrit }), index);
      expect(analyse.question?.formationIds).toEqual(['recAAA']);
    }
  });

  it('rattache plusieurs formations séparées par une barre', () => {
    const analyse = analyserLigne(
      ligneCorrecte({ formations: 'Urgences au cabinet dentaire|Plaies et cicatrisation' }),
      index,
    );

    expect(analyse.question?.formationIds).toEqual(['recAAA', 'recBBB']);
  });

  it('nomme la formation inconnue plutôt que de dire « formation invalide »', () => {
    const analyse = analyserLigne(ligneCorrecte({ formations: 'Parodontie avancée' }), index);

    const erreur = analyse.erreurs.find((e) => e.colonne === 'formations');
    expect(erreur?.message).toContain('Parodontie avancée');
  });

  it('lit la difficulté en toutes lettres et retient facile par défaut', () => {
    expect(analyserLigne(ligneCorrecte({ difficulte: 'Difficile' }), index).question?.difficulte)
      .toBe(3);
    expect(analyserLigne(ligneCorrecte({ difficulte: '2' }), index).question?.difficulte).toBe(2);
    expect(analyserLigne(ligneCorrecte({ difficulte: '' }), index).question?.difficulte).toBe(1);
  });

  it('n’écrit pas les colonnes de source laissées vides', () => {
    const analyse = analyserLigne(ligneCorrecte(), index);

    // Une cellule vide ne produit pas `null`, elle ne produit pas de champ.
    expect(analyse.question && 'sourceFiche' in analyse.question).toBe(false);
    expect(analyse.question && 'sourceVersion' in analyse.question).toBe(false);
  });

  it('conserve les colonnes de source renseignées', () => {
    const analyse = analyserLigne(
      ligneCorrecte({ sourceFiche: 'Argumentaire DPC', sourceVersion: 'v2' }),
      index,
    );

    expect(analyse.question?.sourceFiche).toBe('Argumentaire DPC');
    expect(analyse.question?.sourceVersion).toBe('v2');
  });
});

describe('analyserLigne — la validation reste celle de l’éditeur', () => {
  it('reprend le message de validation, localisé sur sa colonne', () => {
    const analyse = analyserLigne(ligneCorrecte({ explication: '' }), index);

    const erreur = analyse.erreurs.find((e) => e.colonne === 'explication');
    // Mot pour mot celui que l'éditeur affiche : une seule source.
    expect(erreur?.message).toContain("L'explication est obligatoire");
  });

  it('refuse un libellé d’option vide, que les règles Firestore ne voient pas', () => {
    const analyse = analyserLigne(ligneCorrecte({ reponses: 'Oui||Non' }), index);

    // Deux options seulement : la cellule vide au milieu est écartée au
    // découpage, et ce qui reste doit rester cohérent.
    expect(analyse.question?.ordreOptions).toHaveLength(2);
  });

  it('refuse une option unique', () => {
    const analyse = analyserLigne(
      ligneCorrecte({ reponses: 'Seule réponse', bonnesReponses: '1' }),
      index,
    );

    expect(analyse.erreurs.some((e) => e.colonne === 'reponses')).toBe(true);
  });

  it('applique les plafonds du modèle, sans les redéfinir', () => {
    const analyse = analyserLigne(
      ligneCorrecte({ enonce: 'a'.repeat(PLAFONDS.enonce + 1) }),
      index,
    );

    const erreur = analyse.erreurs.find((e) => e.colonne === 'enonce');
    expect(erreur?.message).toContain(String(PLAFONDS.enonce));
  });

  it('exige un contexte pour une mise en situation, et lui seul', () => {
    const sans = analyserLigne(
      ligneCorrecte({ format: 'mise en situation', contexte: '' }),
      index,
    );
    expect(sans.erreurs.some((e) => e.colonne === 'contexte')).toBe(true);

    const avec = analyserLigne(
      ligneCorrecte({ format: 'mise en situation', contexte: 'Un praticien vous appelle.' }),
      index,
    );
    expect(avec.erreurs).toEqual([]);
    expect(avec.question?.contexte).toBe('Un praticien vous appelle.');
  });

  it('ignore le contexte d’une question qui n’est pas une mise en situation', () => {
    const analyse = analyserLigne(ligneCorrecte({ contexte: 'Texte en trop' }), index);

    expect(analyse.erreurs).toEqual([]);
    expect(analyse.question?.contexte).toBeNull();
  });

  it('ne dit pas deux fois la même chose sur une colonne déjà signalée', () => {
    // Format inconnu : la traduction le signale, la validation aussi. Une
    // seule erreur doit remonter, sinon on cherche deux corrections.
    const analyse = analyserLigne(ligneCorrecte({ format: 'inconnu' }), index);

    expect(analyse.erreurs.filter((e) => e.colonne === 'format')).toHaveLength(1);
  });

  it('remonte toutes les colonnes fautives d’un coup', () => {
    const analyse = analyserLigne(
      ligneCorrecte({ explication: '', theme: '', formations: 'Inexistante' }),
      index,
    );

    const colonnes = analyse.erreurs.map((e) => e.colonne);
    expect(colonnes).toContain('explication');
    expect(colonnes).toContain('theme');
    expect(colonnes).toContain('formations');
    expect(analyse.question).toBeNull();
  });
});

describe('lireCollage', () => {
  const entete = 'format\tenonce\treponses\tbonnesReponses\texplication\tformations\ttheme';

  it('associe les colonnes par leur nom, quel que soit leur ordre', () => {
    const inverse = 'theme\tformations\texplication\tbonnesReponses\treponses\tenonce\tformat';
    const resultat = lireCollage(`${inverse}\npublics\trecAAA\tParce que\t1\tOui|Non\tUne question ?\tvf`);

    expect(resultat.etat).toBe('lu');
    if (resultat.etat !== 'lu') return;
    expect(resultat.lignes[0]?.valeurs.format).toBe('vf');
    expect(resultat.lignes[0]?.valeurs.theme).toBe('publics');
  });

  it('reconnaît les en-têtes accentués, majuscules ou soulignés', () => {
    const varie = 'Format\tÉnoncé\tRéponses\tBonne réponse\tExplication\tFormation\tThème';
    const resultat = lireCollage(`${varie}\nvf\tUne question ?\tOui|Non\t1\tParce que\trecAAA\tpublics`);

    expect(resultat.etat).toBe('lu');
  });

  it('refuse en bloc quand l’en-tête ne dit pas ce que contiennent les colonnes', () => {
    const resultat = lireCollage('colonne1\tcolonne2\nvaleur\tvaleur');

    expect(resultat.etat).toBe('entete-illisible');
    if (resultat.etat !== 'entete-illisible') return;
    expect(resultat.manquantes).toContain('enonce');
  });

  it('signale les colonnes en trop sans les laisser bloquer l’import', () => {
    const resultat = lireCollage(`${entete}\tcommentaire\nvf\tQ ?\tOui|Non\t1\tParce que\trecAAA\tpublics\tà revoir`);

    expect(resultat.etat).toBe('lu');
    if (resultat.etat !== 'lu') return;
    expect(resultat.ignorees).toEqual(['commentaire']);
  });

  it('donne une valeur vide, jamais absente, à une ligne plus courte que l’en-tête', () => {
    const resultat = lireCollage(`${entete}\tdifficulte\nvf\tQ ?\tOui|Non\t1\tParce que\trecAAA\tpublics`);

    expect(resultat.etat).toBe('lu');
    if (resultat.etat !== 'lu') return;
    expect(resultat.lignes[0]?.valeurs.difficulte).toBe('');
  });

  it('rend « vide » sur un collage blanc', () => {
    expect(lireCollage('   ').etat).toBe('vide');
  });
});

describe('avertissements — signaler sans bloquer', () => {
  it('annonce la difficulté prise par défaut', () => {
    const analyse = analyserLigne(ligneCorrecte({ difficulte: '' }), index);

    // Elle passe : c'est un avertissement, pas une erreur.
    expect(analyse.erreurs).toEqual([]);
    expect(analyse.question?.difficulte).toBe(1);
    expect(analyse.avertissements.map((a) => a.genre)).toContain('difficulte-par-defaut');
  });

  it('se tait quand la difficulté est déclarée', () => {
    const analyse = analyserLigne(ligneCorrecte({ difficulte: 'moyenne' }), index);

    expect(analyse.avertissements).toEqual([]);
  });

  it('signale un énoncé déjà présent dans la banque, sans le refuser', () => {
    const analyse = analyserLigne(ligneCorrecte(), index);
    const [avec] = signalerDoublons([analyse], [analyse.ligne.valeurs.enonce]);

    expect(avec?.question).not.toBeNull();
    expect(avec?.avertissements.some((a) => a.genre === 'doublon')).toBe(true);
  });

  it('reconnaît le doublon malgré la casse et les accents', () => {
    const analyse = analyserLigne(ligneCorrecte({ enonce: 'Quels PUBLICS ?' }), index);
    const [avec] = signalerDoublons([analyse], ['quels publics ?']);

    expect(avec?.avertissements.some((a) => a.genre === 'doublon')).toBe(true);
  });

  it('signale un doublon interne au lot en nommant la première ligne', () => {
    const premiere = analyserLigne(ligneCorrecte(), index);
    const seconde = analyserLigne({ ...ligneCorrecte(), numero: 7 }, index);
    const [, deuxieme] = signalerDoublons([premiere, seconde], []);

    expect(deuxieme?.avertissements.find((a) => a.genre === 'doublon')?.message).toContain('2');
  });

  it('ne signale aucun doublon quand les énoncés diffèrent', () => {
    const a = analyserLigne(ligneCorrecte({ enonce: 'Première question ?' }), index);
    const b = analyserLigne({ ...ligneCorrecte({ enonce: 'Seconde question ?' }), numero: 3 }, index);
    const resultat = signalerDoublons([a, b], ['Une question sans rapport ?']);

    const doublons = resultat.flatMap((ligne) =>
      ligne.avertissements.filter((a) => a.genre === 'doublon'),
    );
    expect(doublons).toEqual([]);
  });
});
