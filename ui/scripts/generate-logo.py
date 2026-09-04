from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
SCALE = 3
canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

font_dir = Path("C:/Windows/Fonts")
serif_regular = font_dir / "georgia.ttf"
serif_bold = font_dir / "georgiab.ttf"
if not serif_regular.exists():
    serif_regular = Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf")
    serif_bold = Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf")


def cubic_bezier(start, control_a, control_b, end, steps=36):
    points = []
    for index in range(steps):
        t = index / steps
        inverse = 1 - t
        x = (
            inverse**3 * start[0]
            + 3 * inverse**2 * t * control_a[0]
            + 3 * inverse * t**2 * control_b[0]
            + t**3 * end[0]
        )
        y = (
            inverse**3 * start[1]
            + 3 * inverse**2 * t * control_a[1]
            + 3 * inverse * t**2 * control_b[1]
            + t**3 * end[1]
        )
        points.append((round(x * SCALE), round(y * SCALE)))
    return points


# Asymmetric Bézier field follows the soft, slightly flattened original shape.
segments = [
    ((440, 72), (625, 60), (780, 165), (842, 345)),
    ((842, 345), (895, 500), (838, 660), (744, 752)),
    ((744, 752), (635, 836), (445, 842), (286, 811)),
    ((286, 811), (142, 782), (88, 650), (98, 464)),
    ((98, 464), (86, 286), (162, 151), (294, 96)),
    ((294, 96), (342, 77), (392, 70), (440, 72)),
]
blob_points = []
for segment in segments:
    blob_points.extend(cubic_bezier(*segment))
draw.polygon(blob_points, fill=(218, 218, 218, 255))

font_k = ImageFont.truetype(str(serif_regular), 405 * SCALE)
font_b = ImageFont.truetype(str(serif_bold), 390 * SCALE)
draw.text(
    (165 * SCALE, 115 * SCALE),
    "K",
    font=font_k,
    fill=(15, 15, 15, 255),
    stroke_width=1 * SCALE,
)
draw.text((405 * SCALE, 300 * SCALE), "B", font=font_b, fill=(15, 15, 15, 255))

# Definition card is drawn on a separate layer for a subtle rotation and shadow.
card = Image.new("RGBA", (535 * SCALE, 205 * SCALE), (0, 0, 0, 0))
card_draw = ImageDraw.Draw(card)
card_draw.rounded_rectangle(
    (15 * SCALE, 18 * SCALE, 515 * SCALE, 185 * SCALE),
    radius=36 * SCALE,
    fill=(0, 0, 0, 28),
)
card_draw.rounded_rectangle(
    (0, 0, 500 * SCALE, 167 * SCALE),
    radius=34 * SCALE,
    fill=(255, 255, 255, 255),
    outline=(205, 205, 205, 255),
    width=2 * SCALE,
)
card_font_bold = ImageFont.truetype(str(serif_bold), 34 * SCALE)
card_font = ImageFont.truetype(str(serif_regular), 30 * SCALE)
card_draw.text(
    (38 * SCALE, 32 * SCALE), "ka·ta", font=card_font_bold, fill=(20, 20, 20, 255)
)
card_draw.text((145 * SCALE, 35 * SCALE), "n", font=card_font, fill=(75, 75, 75, 255))
card_draw.text(
    (38 * SCALE, 83 * SCALE), "unsur bahasa", font=card_font, fill=(30, 30, 30, 255)
)
card_draw.text(
    (38 * SCALE, 120 * SCALE),
    "yang diucapkan atau dituliskan",
    font=ImageFont.truetype(str(serif_regular), 22 * SCALE),
    fill=(70, 70, 70, 255),
)
card = card.rotate(2.5, resample=Image.Resampling.BICUBIC, expand=True)
canvas.alpha_composite(card, (450 * SCALE, 700 * SCALE))

canvas = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
output = Path(__file__).resolve().parents[1] / "public" / "kbbi-logo.png"
output.parent.mkdir(parents=True, exist_ok=True)
canvas.save(output, "PNG", optimize=True)
print(f"Generated {output}")
