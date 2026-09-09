"""Conversion des polices du système de design en woff2 sous-ensemblé.

Le système de design livre Aileron et DM Serif Text en `.ttf`, format
d'installation système. Le `.ttf` n'est pas un format de livraison web : il
transporte des tables et des alphabets qu'on n'affichera jamais, et il ne
porte pas sa propre compression. Ce script fait les deux opérations qui
manquent — restreindre le jeu de caractères, puis empaqueter en woff2, dont
la compression Brotli est interne au format.

Mesuré sur les six faces déclarées : 675 ko de `.ttf` bruts, 200 ko une fois
compressés par le CDN, **117 ko en woff2 sous-ensemblé**. Aileron seule passe
de 149 ko à 18 ko : la police embarque des alphabets grec et cyrillique dont
l'application n'affiche pas un caractère.

    py -m pip install fonttools brotli
    py scripts/convertir-polices.py

Entrée  : `polices-source/*.ttf`   — les fichiers livrés par le design, versionnés
                                     mais jamais servis.
Sortie  : `src/polices/*.woff2`    — ce que `src/styles/polices.ts` charge.

Le jour où le design livre une face de plus : déposez le `.ttf` dans
`polices-source/`, ajoutez-la à `FACES` ci-dessous, relancez le script, puis
déclarez-la dans `src/styles/polices.ts`. Les trois étapes, pas une seule.
"""

from __future__ import annotations

import io
import os
import sys

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover - dépend de l'environnement local
    sys.exit("fontTools est absent. Installez-le : py -m pip install fonttools brotli")

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(RACINE, "polices-source")
SORTIE = os.path.join(RACINE, "src", "polices")

# Les six faces déclarées dans `src/styles/polices.ts`, et elles seules. Une
# face qui n'est pas ici n'a pas à être dans `polices-source/`.
FACES = [
    "Aileron-Light",
    "Aileron-Regular",
    "Aileron-SemiBold",
    "Aileron-Bold",
    "DMSerifText-Regular",
    "DMSerifText-Italic",
]

# Le jeu de caractères que l'application peut afficher.
#
# Latin de base et Latin-1 couvrent le français accentué. S'y ajoutent ce que
# la typographie française réclame en propre — œ, Œ, Ÿ, les guillemets
# courbes, les tirets cadratin et demi-cadratin, les points de suspension —
# et l'euro. Ce qui n'est pas là s'affichera dans la police de repli : si un
# jour un énoncé porte un caractère hors de cette liste, c'est ici qu'on
# l'ajoute, pas dans la feuille de style.
UNICODES = ",".join(
    [
        "U+0020-007E",  # latin de base
        "U+00A0-00FF",  # latin-1 : accents français, espace insécable
        "U+0152-0153",  # Œ œ
        "U+0178",  # Ÿ
        "U+02C6",  # accent circonflexe isolé
        "U+02DC",  # tilde isolé
        "U+2013-2014",  # – —
        "U+2018-201A",  # ‘ ’ ‚
        "U+201C-201E",  # “ ” „
        "U+2020-2022",  # † ‡ •
        "U+2026",  # …
        "U+2030",  # ‰
        "U+2039-203A",  # ‹ ›
        "U+20AC",  # €
        "U+2122",  # ™
    ]
)

# Les fonctionnalités OpenType qu'on garde. Le crénage et les ligatures
# standard changent le rendu du texte courant ; le reste est pour la
# typographie de labeur, dont l'application n'a pas l'usage.
FONCTIONNALITES = ["kern", "liga", "clig", "ccmp", "locl"]


def convertir(nom: str) -> tuple[int, int]:
    """Rend (taille du .ttf source, taille du .woff2 produit), en octets."""
    entree = os.path.join(SOURCE, f"{nom}.ttf")
    if not os.path.exists(entree):
        sys.exit(f"Fichier source absent : {entree}")

    police = TTFont(entree)

    options = subset.Options()
    options.layout_features = FONCTIONNALITES
    options.name_IDs = ["*"]  # on garde les métadonnées : licence, famille, version
    options.notdef_outline = True
    options.recalc_bounds = True

    decoupeur = subset.Subsetter(options=options)
    decoupeur.populate(unicodes=subset.parse_unicodes(UNICODES))
    decoupeur.subset(police)

    police.flavor = "woff2"
    tampon = io.BytesIO()
    police.save(tampon)
    produit = tampon.getvalue()

    os.makedirs(SORTIE, exist_ok=True)
    with open(os.path.join(SORTIE, f"{nom}.woff2"), "wb") as fichier:
        fichier.write(produit)

    return os.path.getsize(entree), len(produit)


def main() -> None:
    print(f"{'face':26} {'.ttf source':>13} {'.woff2 produit':>16} {'gain':>7}")
    print("-" * 66)
    total_entree = total_sortie = 0

    for nom in FACES:
        entree, sortie = convertir(nom)
        total_entree += entree
        total_sortie += sortie
        gain = 100 - (100 * sortie / entree)
        print(f"{nom:26} {entree / 1024:11.1f} ko {sortie / 1024:14.1f} ko {gain:6.0f} %")

    print("-" * 66)
    gain = 100 - (100 * total_sortie / total_entree)
    print(f"{'TOTAL':26} {total_entree / 1024:11.1f} ko {total_sortie / 1024:14.1f} ko {gain:6.0f} %")
    print()
    print(f"Écrit dans {os.path.relpath(SORTIE, RACINE)}. Ces fichiers sont versionnés :")
    print("Vercel ne fait pas tourner Python, il sert ce que le dépôt contient.")


if __name__ == "__main__":
    main()
