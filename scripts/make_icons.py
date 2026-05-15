"""Generate PWA icons for shunkan-eisaku."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

BG = (74, 158, 255, 255)   # accent blue
FG = (255, 255, 255, 255)


def find_font(size):
    candidates = [
        r"C:\Windows\Fonts\YuGothB.ttc",
        r"C:\Windows\Fonts\meiryob.ttc",
        r"C:\Windows\Fonts\meiryo.ttc",
        r"C:\Windows\Fonts\YuGothM.ttc",
        r"C:\Windows\Fonts\msgothic.ttc",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make(size: int):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    # rounded square mask
    radius = int(size * 0.22)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle((0, 0, size, size), radius=radius, fill=255)

    # Text: 英 (large)
    font = find_font(int(size * 0.55))
    text = "英"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1] - int(size * 0.02)
    draw.text((tx, ty), text, font=font, fill=FG)

    # apply rounded mask
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(OUT / f"icon-{size}.png")
    print(f"wrote icon-{size}.png")


if __name__ == "__main__":
    for s in (192, 512):
        make(s)
