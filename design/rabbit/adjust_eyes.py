"""Unify the approved rabbit's eye highlights in the native 64×72 PNGs.

Requires Pillow. Idempotent: only the two registered eye windows are repainted.
The preview enlarges the actual runtime PNGs with nearest-neighbor sampling.
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
CHARACTERS = HERE.parents[1] / 'public/assets/characters'
PINK = (242, 217, 219, 255)
INK = (77, 48, 31, 255)
LIGHT = (253, 246, 227, 255)
PATTERN = (' ### ', '#WW##', '#W###', '#####', ' ### ')
GUIDES = {
    'sprout-rabbit': ((24, 35), (35, 35)),
    'sprout-rabbit-jump': ((21, 39), (32, 39)),
}


def main():
    for name, eyes in GUIDES.items():
        path = CHARACTERS / f'{name}.png'
        image = Image.open(path).convert('RGBA')
        for left, top in eyes:
            # Remove the old center glint and its gray ring within the eye only.
            ImageDraw.Draw(image).rectangle((left, top, left + 5, top + 4), fill=PINK)
            for y, row in enumerate(PATTERN):
                for x, mark in enumerate(row):
                    image.putpixel((left + x, top + y), LIGHT if mark == 'W' else INK if mark == '#' else PINK)
        image.save(path, optimize=True)

    preview = Image.new('RGB', (1024, 384), '#e8dfcd')
    for i, name in enumerate(('sprout-puppy', 'sprout-cat', 'sprout-rabbit', 'sprout-rabbit-jump')):
        image = Image.open(CHARACTERS / f'{name}.png').convert('RGBA')
        large = image.resize((256, 288), Image.Resampling.NEAREST)
        preview.paste(large, (i * 256, 16), large)
        preview.paste(image, (i * 256 + 96, 308), image)
    preview.save(HERE / 'eye-preview.png')


if __name__ == '__main__':
    main()
