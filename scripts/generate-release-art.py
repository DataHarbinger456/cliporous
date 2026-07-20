#!/usr/bin/env python3
"""Generate deterministic BatchClip release artwork from the product color tokens."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
CREAM = "#f6ecd9"
WARM = "#f7f3ec"
ESPRESSO = "#23100c"
VIOLET = "#9f75ff"
MUTED = "#8f817b"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "Inter-Bold.ttf" if bold else "Inter.ttf"
    return ImageFont.truetype(str(ROOT / "resources" / "fonts" / name), size)


def draw_mark(canvas: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = ImageDraw.Draw(canvas)
    left, top, right, bottom = box
    width = right - left
    radius = max(8, width // 7)
    draw.rounded_rectangle(box, radius=radius, fill=CREAM, outline=VIOLET, width=max(2, width // 48))

    pad = width * 0.2
    body_top = top + width * 0.43
    body = (left + pad, body_top, right - pad, bottom - pad)
    draw.rounded_rectangle(body, radius=max(4, width // 24), fill=ESPRESSO)

    slate = [
        (left + pad, top + width * 0.28),
        (right - pad * 0.55, top + width * 0.18),
        (right - pad * 0.4, top + width * 0.34),
        (left + pad * 1.1, top + width * 0.44),
    ]
    draw.polygon(slate, fill=ESPRESSO)
    stripe_width = max(3, width // 38)
    for fraction in (0.34, 0.52, 0.7):
        x = left + width * fraction
        draw.line(
            (x, top + width * 0.26, x + width * 0.1, top + width * 0.38),
            fill=CREAM,
            width=stripe_width,
        )
    playhead_x = left + width * 0.57
    draw.line(
        (playhead_x, body_top + width * 0.07, playhead_x, bottom - pad - width * 0.07),
        fill=VIOLET,
        width=max(3, width // 30),
    )


def make_icon() -> Image.Image:
    image = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((52, 52, 972, 972), radius=220, fill=ESPRESSO)
    draw_mark(image, (220, 220, 804, 804))
    return image


def icon_on_warm(icon: Image.Image, size: tuple[int, int]) -> Image.Image:
    layer = Image.new("RGBA", size, WARM)
    layer.alpha_composite(icon.resize(size, Image.Resampling.LANCZOS))
    return layer.convert("RGB")


def save_icons(icon: Image.Image) -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    icon.save(BUILD / "icon.png")
    icon.save(BUILD / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    iconset = BUILD / "icon.iconset"
    iconset.mkdir(exist_ok=True)
    for size in (16, 32, 128, 256, 512):
        icon.resize((size, size), Image.Resampling.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
        icon.resize((size * 2, size * 2), Image.Resampling.LANCZOS).save(
            iconset / f"icon_{size}x{size}@2x.png"
        )

    linux_icons = BUILD / "icons"
    linux_icons.mkdir(exist_ok=True)
    for size in (16, 32, 48, 64, 128, 256, 512, 1024):
        icon.resize((size, size), Image.Resampling.LANCZOS).save(linux_icons / f"{size}x{size}.png")


def installer_sidebar(icon: Image.Image) -> None:
    image = Image.new("RGB", (164, 314), WARM)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 8, 314), fill=VIOLET)
    image.paste(icon_on_warm(icon, (84, 84)), (40, 26))
    draw.text((24, 132), "BATCHCLIP", font=font(17, True), fill=ESPRESSO)
    draw.text((24, 158), "Your cut room", font=font(11), fill=MUTED)
    for index, width in enumerate((112, 92, 104)):
        y = 205 + index * 25
        draw.rounded_rectangle((24, y, 24 + width, y + 16), radius=3, outline=ESPRESSO, width=1)
        draw.line((44 + index * 18, y + 2, 44 + index * 18, y + 14), fill=VIOLET, width=2)
    image.save(BUILD / "installerSidebar.bmp")


def installer_header(icon: Image.Image) -> None:
    image = Image.new("RGB", (150, 57), WARM)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 52, 150, 57), fill=VIOLET)
    image.paste(icon_on_warm(icon, (38, 38)), (9, 7))
    draw.text((55, 13), "BatchClip", font=font(14, True), fill=ESPRESSO)
    draw.text((55, 31), "Creator cut room", font=font(8), fill=MUTED)
    image.save(BUILD / "installerHeader.bmp")


def dmg_background(icon: Image.Image) -> None:
    image = Image.new("RGB", (540, 380), WARM)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 540, 8), fill=VIOLET)
    image.paste(icon_on_warm(icon, (74, 74)), (233, 26))
    title = "Move BatchClip into Applications"
    title_box = draw.textbbox((0, 0), title, font=font(18, True))
    draw.text(((540 - (title_box[2] - title_box[0])) / 2, 116), title, font=font(18, True), fill=ESPRESSO)
    draw.line((190, 266, 350, 266), fill=VIOLET, width=4)
    draw.polygon(((350, 266), (334, 256), (334, 276)), fill=VIOLET)
    image.save(BUILD / "dmg-background.png")


if __name__ == "__main__":
    app_icon = make_icon()
    save_icons(app_icon)
    installer_sidebar(app_icon)
    installer_header(app_icon)
    dmg_background(app_icon)
