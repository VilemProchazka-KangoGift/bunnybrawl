"""Build a silhouette/color/native-size overview from the selected expressive atlases."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from prepare_atlases import ANIMALS, CELL


HERE = Path(__file__).parent
WIDTH, HEIGHT = 1600, 1040


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    for path in (Path("C:/Windows/Fonts") / name, Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")):
        if path.exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def resized(pose: Image.Image, target_height: int, max_width: int) -> Image.Image:
    ratio = min(target_height / pose.height, max_width / pose.width)
    return pose.resize((round(pose.width * ratio), round(pose.height * ratio)), Image.Resampling.LANCZOS)


board = Image.new("RGB", (WIDTH, HEIGHT), "#eeeade")
draw = ImageDraw.Draw(board)
draw.text((30, 19), "A cast of nineteen distinct shapes", font=font(31, True), fill="#2b4039")
draw.text((31, 60), "Silhouette · color · approximately native match height", font=font(17), fill="#607067")

for index, animal in enumerate(ANIMALS):
    col, row = index % 5, index // 5
    left, top = 18 + col * 316, 98 + row * 232
    draw.rounded_rectangle((left, top, left + 304, top + 218), radius=8,
                           fill="#faf8f1", outline="#cbd1c5", width=2)
    draw.text((left + 13, top + 9), animal.capitalize(), font=font(20, True), fill="#2b4039")
    atlas = Image.open(HERE / f"{animal}-expressive-atlas.png").convert("RGBA")
    pose = atlas.crop((0, 0, CELL, CELL))
    pose = pose.crop(pose.getbbox())
    silhouette = Image.new("RGBA", pose.size, "#23332e")
    silhouette.putalpha(pose.getchannel("A"))
    for art, cx in ((silhouette, left + 83), (pose, left + 219)):
        sample = resized(art, 113, 125)
        board.paste(sample, (cx - sample.width // 2, top + 161 - sample.height), sample)
    native = resized(pose, 41, 70)
    board.paste(native, (left + 139 - native.width // 2, top + 201 - native.height), native)
    draw.text((left + 49, top + 183), "shape", font=font(12), fill="#718179")
    draw.text((left + 213, top + 183), "color", font=font(12), fill="#718179")

board.save(HERE / "roster-silhouettes.png", optimize=True)
