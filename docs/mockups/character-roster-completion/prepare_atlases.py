"""Normalize generated sheets into ten isolated, evenly registered preview cells.

Requires Pillow and NumPy. Source PNGs remain untouched for art review.
"""

from pathlib import Path

import numpy as np
from PIL import Image


HERE = Path(__file__).parent
ANIMALS = (
    "wolf", "panda", "pig", "cow", "goat", "horse", "sheep",
    "monkey", "tiger", "rhino", "hedgehog", "chick", "axolotl",
)
CELL = 480


def separator(projection: np.ndarray, expected: int, radius: int) -> int:
    start = max(1, expected - radius)
    end = min(len(projection) - 1, expected + radius)
    empty = np.flatnonzero(projection[start:end] == 0) + start
    if len(empty):
        # Prefer the center of a clear gap; a one-pixel hole inside a pose is not a separator.
        runs = np.split(empty, np.where(np.diff(empty) > 1)[0] + 1)
        wide = [run for run in runs if len(run) >= 8]
        if wide:
            best = min(wide, key=lambda run: abs(int(run[len(run) // 2]) - expected))
            return int(best[len(best) // 2])
    return int(np.argmin(projection[start:end]) + start)


for animal in ANIMALS:
    source = Image.open(HERE / f"{animal}-poses-source.png").convert("RGBA")
    alpha = np.asarray(source)[:, :, 3] > 8
    w, h = source.size
    y_split = separator(alpha.sum(axis=1), int(h * .55), int(h * .13))
    atlas = Image.new("RGBA", (CELL * 5, CELL * 2))
    for row, (top, bottom) in enumerate(((0, y_split), (y_split, h))):
        projection = alpha[top:bottom].sum(axis=0)
        cuts = [0] + [separator(projection, round(w * col / 5), round(w * .14)) for col in range(1, 5)] + [w]
        for col, (left, right) in enumerate(zip(cuts, cuts[1:])):
            region = source.crop((left, top, right, bottom))
            box = region.getbbox()
            if box is None:
                raise RuntimeError(f"Empty pose: {animal} row {row} column {col}")
            pose = region.crop(box)
            if pose.width > CELL - 24 or pose.height > CELL - 24:
                pose.thumbnail((CELL - 24, CELL - 24), Image.Resampling.LANCZOS)
            x = col * CELL + (CELL - pose.width) // 2
            y = row * CELL + CELL - 14 - pose.height
            atlas.alpha_composite(pose, (x, y))
    atlas.save(HERE / f"{animal}-poses-atlas.png", optimize=True)
    print(f"{animal}: row separator {y_split}")
