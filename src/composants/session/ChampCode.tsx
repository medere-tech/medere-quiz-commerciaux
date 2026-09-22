'use client';

import { useId, useState, type CSSProperties } from 'react';

import { Icone } from '@/composants/ds/Icone';

/**
 * Le champ où l'on saisit le code de la séance.
 *
 * **Pourquoi ce n'est pas `Champ`.** La maquette lui donne une autre nature :
 * vingt-six pixels de haut, un interlettrage de 0,22 em, des capitales. Ce
 * n'est pas un champ de formulaire qu'on remplit, c'est un code qu'on recopie
 * en écoutant quelqu'un le dire à voix haute, et qu'on doit pouvoir relire de
 * loin pour vérifier qu'on ne s'est pas trompé. `Champ` reste la primitive du
 * système et n'est pas touchée.
 *
 * **La coche n'est pas une validation.** Elle dit « ce champ est rempli », pas
 * « ce code existe » — seule la recherche peut le dire. Elle disparaît dès
 * qu'une erreur est annoncée.
 *
 * **La saisie est normalisée à la frappe** : capitales et sans espaces. Un code
 * lu à voix haute se recopie souvent avec une espace au milieu, et se faire
 * refuser pour ça serait incompréhensible. L'alphabet des codes exclut déjà O,
 * 0, I et 1 — voir `ALPHABET_CODE` dans `depot.ts` — mais on ne filtre pas les
 * caractères ici : refuser silencieusement une touche laisserait croire au
 * clavier cassé. Le code sera simplement introuvable, et l'écran le dira.
 */
export function ChampCode({
  valeur,
  onChange,
  onEntree,
  erreur,
  aide,
  taille = 'md',
  autoFocus,
}: {
  valeur: string;
  onChange: (valeur: string) => void;
  /** Entrée vaut « Rejoindre » : la maquette l'annonce sous le bouton. */
  onEntree?: () => void;
  erreur?: string;
  aide?: string;
  taille?: 'md' | 'lg';
  autoFocus?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const identifiant = useId();
  const identifiantAide = `${identifiant}-aide`;

  const grand = taille === 'lg';
  const rempli = valeur.trim() !== '';

  const bordure: CSSProperties = erreur
    ? { borderColor: 'var(--status-danger)', boxShadow: '0 0 0 3px rgba(194, 66, 66, 0.12)' }
    : focus || rempli
      ? { borderColor: 'var(--focus-ring)', boxShadow: 'var(--focus-halo)' }
      : { borderColor: 'var(--border-default)', boxShadow: 'none' };

  return (
    <div style={{ display: 'block', fontFamily: 'var(--font-sans)' }}>
      <label
        htmlFor={identifiant}
        style={{
          display: 'block',
          fontSize: 'var(--body-sm-size)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-heading)',
          marginBottom: 'var(--space-2)',
        }}
      >
        Code de la séance
      </label>

      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--surface-card)',
          border: '1px solid',
          borderRadius: 'var(--radius-md)',
          padding: grand ? '16px 20px' : '13px 16px',
          transition: 'var(--transition-base)',
          ...bordure,
        }}
      >
        <input
          id={identifiant}
          name="code"
          value={valeur}
          onChange={(evenement) =>
            onChange(evenement.target.value.toUpperCase().replace(/\s+/g, ''))
          }
          onKeyDown={(evenement) => {
            if (evenement.key === 'Enter' && onEntree) {
              evenement.preventDefault();
              onEntree();
            }
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder="JEUDI7"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          // Le clavier des téléphones s'ouvre en capitales sur un champ de code.
          inputMode="text"
          autoFocus={autoFocus}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur || aide ? identifiantAide : undefined}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-sans)',
            fontSize: grand ? 26 : 22,
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            lineHeight: 1.2,
            color: 'var(--text-heading)',
          }}
        />
        {erreur ? (
          <Icone nom="alert" taille={20} epaisseur={2} couleur="var(--status-danger)" />
        ) : (
          rempli && (
            <Icone nom="check" taille={20} epaisseur={2.2} couleur="var(--status-success)" />
          )
        )}
      </span>

      {(erreur || aide) && (
        <span
          id={identifiantAide}
          // Le message de recherche remplace l'aide : il doit être annoncé
          // quand il apparaît, sans que l'utilisateur ait à relire le champ.
          role={erreur ? 'alert' : undefined}
          style={{
            display: 'block',
            marginTop: 'var(--space-2)',
            fontSize: 'var(--body-xs-size)',
            lineHeight: 1.45,
            color: erreur ? 'var(--status-danger-texte)' : 'var(--text-muted)',
          }}
        >
          {erreur || aide}
        </span>
      )}
    </div>
  );
}
