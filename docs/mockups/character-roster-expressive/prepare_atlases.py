"""Split the uneven generated 4x2 sheets into isolated 480px pose cells.

Requires Pillow and NumPy. The source sheets stay intact as art provenance.
"""

from pathlib import Path

import numpy as np
from PIL import Image


HERE = Path(__file__).parent
ANIMALS = (
    "bunny", "fox", "frog", "bear", "owl", "cat", "wolf", "panda", "pig",
    "cow", "goat", "horse", "sheep", "monkey", "tiger", "rhino",
    "hedgehog", "chick", "axolotl",
)
CELL = 480


def separator(projection: np.ndarray, expected: int, radius: int) -> int:
    start = max(1, expected - radius)
    end = min(len(projection) - 1, expected + radius)
    empty = np.flatnonzero(projection[start:end] == 0) + start
    if len(empty):
        runs = np.split(empty, np.where(np.diff(empty) > 1)[0] + 1)
        wide = [run for run in runs if len(run) >= 8]
        if wide:
            best = min(wide, key=lambda run: abs(int(run[len(run) // 2]) - expected))
            return int(best[len(best) // 2])
    return int(np.argmin(projection[start:end]) + start)


def split_sheet(source: Image.Image, columns: int, rows: int = 2) -> list[Image.Image]:
    if rows != 2:
        raise ValueError("Only 2-row concept sheets are supported")
    source = source.convert("RGBA")
    alpha = np.asarray(source)[:, :, 3] > 8
    w, h = source.size
    middle = separator(alpha.sum(axis=1), h // 2, int(h * .17))
    output: list[Image.Image] = []
    for top, bottom in ((0, middle), (middle, h)):
        projection = alpha[top:bottom].sum(axis=0)
        cuts = [0] + [separator(projection, round(w * col / columns), round(w * .13)) for col in range(1, columns)] + [w]
        if cuts != sorted(cuts):
            raise RuntimeError(f"Unordered pose separators: {cuts}")
        for left, right in zip(cuts, cuts[1:]):
            region = source.crop((left, top, right, bottom))
            box = region.getbbox()
            if box is None:
                raise RuntimeError("Empty pose cell")
            output.append(region.crop(box))
    return output


def place_pose(atlas: Image.Image, pose: Image.Image, index: int, columns: int) -> None:
    if pose.width > CELL - 24 or pose.height > CELL - 24:
        pose.thumbnail((CELL - 24, CELL - 24), Image.Resampling.LANCZOS)
    col, row = index % columns, index // columns
    atlas.alpha_composite(pose, (col * CELL + (CELL - pose.width) // 2,
                                  row * CELL + CELL - 14 - pose.height))


if __name__ == "__main__":
    for animal in ANIMALS:
        source = Image.open(HERE / f"{animal}-expressive-source.png")
        poses = split_sheet(source, 4)
        atlas = Image.new("RGBA", (CELL * 4, CELL * 2))
        for index, pose in enumerate(poses):
            place_pose(atlas, pose, index, 4)
        atlas.save(HERE / f"{animal}-expressive-atlas.png", optimize=True)
        print(f"{animal}: {source.width}x{source.height} -> {atlas.width}x{atlas.height}")
