"""Render matched previous-versus-expressive action boards for every animal."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from prepare_atlases import ANIMALS, CELL, split_sheet


HERE = Path(__file__).parent
MOCKUPS = HERE.parent
LABELS = (
    "Signature idle", "Walk A", "Walk B", "Jump",
    "Sit", "Fast stomp", "Landing", "Attentive",
)
PREVIOUS = (0, 1, 3, 4, 7, 8, 9, 5)
BUNNY_PREVIOUS = (5, 1, 3, 4, 7, 8, 9, 6)
OLD_SOURCES = {
    "fox": MOCKUPS / "character-roster-batch-1/fox-poses-source.png",
    "frog": MOCKUPS / "character-roster-batch-1/frog-poses-source.png",
    "bear": MOCKUPS / "character-roster-batch-2/bear-poses-source.png",
    "owl": MOCKUPS / "character-roster-batch-2/owl-poses-source.png",
    "cat": MOCKUPS / "character-roster-batch-2/cat-poses-source.png",
}
BRIEFS = {
    "bunny": ("Anxious, brave", "Long ears and broad hind feet"),
    "fox": ("Proud show-off", "Huge tail as counterweight"),
    "frog": ("Giddy, silly", "Webbed hind feet and springing legs"),
    "bear": ("Rugged, sleepy", "Heavy shoulders and oversized paws"),
    "owl": ("Pompous", "Wings, brows, and tiny talons"),
    "cat": ("Aloof, smug", "Arched spine and expressive tail"),
    "wolf": ("Wary, rugged", "Shaggy hackles and brush tail"),
    "panda": ("Sweet, clumsy", "Pear belly and tiny feet"),
    "pig": ("Silly, eager", "Barrel body, floppy ears, curly tail"),
    "cow": ("Gentle, absent-minded", "High hips, udder, and wide hooves"),
    "goat": ("Stubborn, playful", "Curled horns, beard, cloven hooves"),
    "horse": ("Elegant, nervous", "Long legs, mane, and tail"),
    "sheep": ("Shy, dreamy", "Cloudlike fleece on tiny legs"),
    "monkey": ("Cheeky acrobat", "Long hands and prehensile tail"),
    "tiger": ("Intense, cocky", "Athletic shoulders and ringed tail"),
    "rhino": ("Stoic, stubborn", "Heavy shoulder hump and horn"),
    "hedgehog": ("Grumpy, timid", "Round body, short limbs, quill dome"),
    "chick": ("Tiny, brave", "Wings, thin legs, three-toed feet"),
    "axolotl": ("Dreamy, playful", "Long fingers, tail, feathered gills"),
}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    for path in (Path("C:/Windows/Fonts") / name, Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")):
        if path.exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def crop_cell(atlas: Image.Image, index: int, columns: int, cell_w: int, cell_h: int) -> Image.Image:
    region = atlas.crop(((index % columns) * cell_w, (index // columns) * cell_h,
                         (index % columns + 1) * cell_w, (index // columns + 1) * cell_h))
    return region.crop(region.getbbox())


def previous_poses(animal: str) -> list[Image.Image]:
    if animal == "bunny":
        atlas = Image.open(MOCKUPS / "character-styles/v4/pocket-bunny-game-atlas.png").convert("RGBA")
        return [crop_cell(atlas, index, 4, 152, 188) for index in BUNNY_PREVIOUS]
    if animal in OLD_SOURCES:
        all_poses = split_sheet(Image.open(OLD_SOURCES[animal]), 5)
        return [all_poses[index] for index in PREVIOUS]
    atlas = Image.open(MOCKUPS / f"character-roster-completion/{animal}-poses-atlas.png").convert("RGBA")
    return [crop_cell(atlas, index, 5, CELL, CELL) for index in PREVIOUS]


def expressive_poses(animal: str) -> list[Image.Image]:
    atlas = Image.open(HERE / f"{animal}-expressive-atlas.png").convert("RGBA")
    return [crop_cell(atlas, index, 4, CELL, CELL) for index in range(8)]


def put_pose(board: Image.Image, pose: Image.Image, cx: int, foot_y: int, target_h: int) -> None:
    ratio = target_h / pose.height
    width = round(pose.width * ratio)
    # A long tail or spread wing must fit its half-card without altering vertical size for the other animal.
    if width > 145:
        ratio *= 145 / width
        width = 145
    height = round(pose.height * ratio)
    resized = pose.resize((width, height), Image.Resampling.LANCZOS)
    board.paste(resized, (cx - width // 2, foot_y - height), resized)


for animal in ANIMALS:
    before = previous_poses(animal)
    after = expressive_poses(animal)
    board = Image.new("RGB", (1440, 1050), "#eeeade")
    draw = ImageDraw.Draw(board)
    title = animal.capitalize()
    personality, trait = BRIEFS[animal]
    draw.text((38, 24), f"{title} · from shared poses to character acting", font=font(32, True), fill="#2b4039")
    draw.text((40, 67), f"{personality}  ·  {trait}", font=font(18), fill="#54685f")
    for index, label in enumerate(LABELS):
        col, row = index % 4, index // 4
        left, top = 34 + col * 353, 110 + row * 464
        draw.rounded_rectangle((left, top, left + 340, top + 450), radius=8,
                               fill="#faf8f1" if row == 0 else "#f7f4eb", outline="#cbd1c5", width=2)
        draw.text((left + 14, top + 12), label, font=font(20, True), fill="#2b4039")
        draw.text((left + 30, top + 46), "BEFORE", font=font(12, True), fill="#708078")
        draw.text((left + 195, top + 46), "EXPRESSIVE", font=font(12, True), fill="#708078")
        put_pose(board, before[index], left + 86, top + 242, 154)
        put_pose(board, after[index], left + 252, top + 242, 154)
        draw.line((left + 170, top + 63, left + 170, top + 251), fill="#e1ded1", width=2)
        draw.line((left + 14, top + 258, left + 326, top + 258), fill="#e1ded1", width=2)
        draw.text((left + 14, top + 275), "Actual game height, paired", font=font(13), fill="#718179")
        put_pose(board, before[index], left + 140, top + 407, 41)
        put_pose(board, after[index], left + 217, top + 407, 41)
        draw.text((left + 90, top + 415), "old", font=font(12), fill="#718179")
        draw.text((left + 250, top + 415), "new", font=font(12), fill="#718179")
    board.save(HERE / f"{animal}-acting-comparison.png", optimize=True)
    print(animal)
