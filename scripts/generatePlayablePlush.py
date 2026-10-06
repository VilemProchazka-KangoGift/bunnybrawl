"""Downsample the approved expressive studies into compact runtime atlases.

The study sheets remain the editable art sources. Run this after changing a
*-expressive-atlas.png in docs/mockups/character-roster-expressive/.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
STUDIES = ROOT / "docs/mockups/character-roster-expressive"
OUTPUT = ROOT / "src/engine/characters/plush/assets"
ANIMALS = (
    "bunny", "fox", "frog", "bear", "owl", "cat", "wolf", "panda", "pig",
    "cow", "goat", "horse", "sheep", "monkey", "tiger", "rhino",
    "hedgehog", "chick", "axolotl",
)
SOURCE_CELL = 480
GAME_CELL = 96  # at least 2x the largest 46 px displayed character height


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for animal in ANIMALS:
        source = Image.open(STUDIES / f"{animal}-expressive-atlas.png").convert("RGBA")
        if source.size != (SOURCE_CELL * 4, SOURCE_CELL * 2):
            raise ValueError(f"Unexpected {animal} atlas size: {source.size}")
        atlas = source.resize((GAME_CELL * 4, GAME_CELL * 2), Image.Resampling.LANCZOS)
        atlas.save(OUTPUT / f"{animal}.webp", "WEBP", quality=88, method=6)
        print(f"{animal}: {source.size} -> {atlas.size}")


if __name__ == "__main__":
    main()
