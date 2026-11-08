"""Export 64×72 bases and real arm/leg walk frames from the approved model sheet.

Run from any directory: python design/avatars/build_avatars.py (requires Pillow).
The existing forest front/back drawings remain the idle bases for that avatar.
"""
from pathlib import Path

from PIL import Image, ImageEnhance

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'public/assets/characters/avatars'
SIZE = (64, 72)
IDS = ('forest', 'mint', 'lavender')
VIEWS = ('down', 'up', 'side')


def blank():
    return Image.new('RGBA', SIZE)


def region(image, box):
    result = blank()
    result.paste(image.crop(box), box[:2])
    return result


def translated(image, x=0, y=0):
    result = blank()
    result.paste(image, (x, y))
    return result


def clean(image):
    image.putalpha(image.getchannel('A').point(lambda a: 255 if a >= 160 else 0))
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y][3] == 0:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def extract(source, column, row):
    tile = source.crop((column * source.width // 3, row * source.height // 3,
                        (column + 1) * source.width // 3, (row + 1) * source.height // 3))
    tile = clean(tile)
    tile = tile.crop(tile.getbbox())
    width = round(tile.width * 62 / tile.height)
    tile = tile.resize((width, 62), Image.Resampling.NEAREST)
    frame = blank()
    frame.paste(tile, ((64 - width) // 2, 9))
    return clean(frame)


def unify_palette(bases):
    swatch = Image.new('RGBA', (192, 72), (241, 0, 238, 255))
    for i, base in enumerate(bases):
        swatch.alpha_composite(base, (i * 64, 0))
    palette = swatch.convert('RGB').quantize(colors=33, method=Image.Quantize.MEDIANCUT)
    result = []
    for base in bases:
        rgb = Image.new('RGB', SIZE, (241, 0, 238))
        rgb.paste(base, mask=base.getchannel('A'))
        frame = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
        frame.putalpha(base.getchannel('A'))
        result.append(clean(frame))
    return result


def darken(image):
    result = ImageEnhance.Brightness(image.convert('RGB')).enhance(.8).convert('RGBA')
    result.putalpha(image.getchannel('A'))
    return result


def walk_frame(base, direction, step):
    # Crop at the hip: the feet actually move independently of the torso.
    torso = region(base, (0, 0, 64, 58))
    frame = blank()
    if direction == 'side':
        leg = region(base, (0, 58, 64, 71))
        far = darken(leg)
        near_x, near_y, far_x, far_y = [(3, 0, -3, -2), (1, -2, -1, 0),
                                      (-3, 0, 3, -2), (-1, -1, 1, 0)][step]
        frame.alpha_composite(translated(far, far_x, far_y))
        frame.alpha_composite(translated(leg, near_x, near_y))
        frame.alpha_composite(translated(torso, 0, -1 if step % 2 else 0))
    else:
        left_leg = region(base, (0, 58, 32, 71))
        right_leg = region(base, (32, 58, 64, 71))
        left_y, right_y = [(0, -3), (0, -1), (-3, 0), (-1, 0)][step]
        spread = 1 if step % 2 == 0 else 0
        frame.alpha_composite(translated(left_leg, -spread, left_y))
        frame.alpha_composite(translated(right_leg, spread, right_y))
        left_arm = region(torso, (0, 44, 24, 58))
        right_arm = region(torso, (40, 44, 64, 58))
        torso.paste((0, 0, 0, 0), (0, 44, 24, 58))
        torso.paste((0, 0, 0, 0), (40, 44, 64, 58))
        bob = -1 if step % 2 else 0
        frame.alpha_composite(translated(left_arm, -spread, right_y // 2 + bob))
        frame.alpha_composite(translated(right_arm, spread, left_y // 2 + bob))
        frame.alpha_composite(translated(torso, 0, bob))
    # y=71 stays transparent; every pose shares a fixed ground anchor at y=70.
    frame.paste((0, 0, 0, 0), (0, 71, 64, 72))
    return clean(frame)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    previews = []
    source = Image.open(HERE / 'model-sheet.png').convert('RGBA')
    for column, avatar_id in enumerate(IDS):
        bases = [extract(source, column, row) for row in range(3)]
        if avatar_id == 'forest':
            bases[0] = Image.open(ROOT / 'public/assets/characters/player-front.png').convert('RGBA')
            bases[1] = Image.open(ROOT / 'public/assets/characters/player-back.png').convert('RGBA')
        else:
            bases = unify_palette(bases)
        sheet = Image.new('RGBA', (320, 216))
        walking = []
        for row, (direction, base) in enumerate(zip(VIEWS, bases)):
            base.save(OUT / f'{avatar_id}-{direction}.png')
            sheet.paste(base, (0, row * 72))
            poses = [walk_frame(base, direction, step) for step in range(4)]
            assert len({pose.tobytes() for pose in poses}) == 4, (avatar_id, direction)
            for step, pose in enumerate(poses):
                sheet.paste(pose, ((step + 1) * 64, row * 72))
            walking.append(poses)
        sheet.save(OUT / f'{avatar_id}-walk.png', optimize=True)
        previews.append(walking)

    # A contact sheet and GIF show all three avatars walking in all directions.
    still = Image.new('RGB', (3 * 64 * 4, 3 * 72 * 4), '#e8dfcd')
    for column, avatar_id in enumerate(IDS):
        for row, direction in enumerate(VIEWS):
            base = Image.open(OUT / f'{avatar_id}-{direction}.png')
            still.paste(base.resize((256, 288), Image.Resampling.NEAREST), (column * 256, row * 288),
                        base.getchannel('A').resize((256, 288), Image.Resampling.NEAREST))
    still.save(HERE / 'avatars-preview.png')
    frames = []
    for step in range(4):
        image = Image.new('RGB', (3 * 64 * 3, 3 * 72 * 3), '#e8dfcd')
        for column in range(3):
            for row in range(3):
                pose = previews[column][row][step].resize((192, 216), Image.Resampling.NEAREST)
                image.paste(pose, (column * 192, row * 216), pose.getchannel('A'))
        frames.append(image)
    frames[0].save(HERE / 'walking-preview.gif', save_all=True, append_images=frames[1:], duration=125, loop=0, disposal=2)
    print('Exported 3 avatars: 12 walk frames + 3 idle directions each (64×72).')


if __name__ == '__main__':
    main()
