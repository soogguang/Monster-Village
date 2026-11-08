"""Export 64×72 bases and individually drawn walk poses.

Run from any directory: python design/avatars/build_avatars.py (requires Pillow).
The existing forest front/back drawings remain the idle bases for that avatar.
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'public/assets/characters/avatars'
SIZE = (64, 72)
IDS = ('forest', 'mint', 'lavender')
VIEWS = ('down', 'up', 'side')


def blank():
    return Image.new('RGBA', SIZE)


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


def touch_up_face(image, avatar_id, direction):
    """Remove subpixel face noise after sampling the generated model sheet."""
    image = image.copy()
    outline = (67, 43, 28, 255)
    # Match the existing avatar's warm outline instead of near-black color noise.
    for y in range(43):
        for x in range(64):
            r, g, b, a = image.getpixel((x, y))
            if a and max(r, g, b) < 85:
                image.putpixel((x, y), outline)
    if direction != 'down':
        return image
    draw = ImageDraw.Draw(image)
    skin = image.getpixel((32, 33))
    if avatar_id == 'mint':
        draw.rectangle((24, 29, 28, 34), fill=skin)
        draw.rectangle((35, 29, 39, 34), fill=skin)
        draw.rectangle((28, 35, 36, 38), fill=skin)
        eye_y, mouth_y = 30, 36
        blush = (222, 150, 122, 255)
    else:
        draw.rectangle((24, 28, 28, 32), fill=skin)
        draw.rectangle((35, 28, 39, 32), fill=skin)
        draw.rectangle((28, 33, 37, 37), fill=skin)
        eye_y, mouth_y = 29, 34
        blush = (243, 169, 151, 255)
    draw.rectangle((26, eye_y, 27, eye_y + 3), fill=outline)
    draw.rectangle((37, eye_y, 38, eye_y + 3), fill=outline)
    draw.rectangle((23, eye_y + 4, 25, eye_y + 5), fill=blush)
    draw.rectangle((39, eye_y + 4, 41, eye_y + 5), fill=blush)
    for x, y in [(30, mouth_y), (31, mouth_y + 1), (32, mouth_y + 1), (33, mouth_y + 1), (34, mouth_y)]:
        draw.point((x, y), fill=outline)
    return image


def remove_strays(image):
    """Keep the connected character; generated sheets can have detached edge noise."""
    image = clean(image)
    alpha = image.getchannel('A')
    points = {(x, y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x, y))}
    largest = set()
    while points:
        seed = points.pop()
        component = {seed}
        stack = [seed]
        while stack:
            x, y = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    candidate = (x + dx, y + dy)
                    if candidate in points:
                        points.remove(candidate)
                        component.add(candidate)
                        stack.append(candidate)
        if len(component) > len(largest):
            largest = component
    mask = Image.new('L', image.size)
    for point in largest:
        mask.putpixel(point, 255)
    image.putalpha(mask)
    return clean(image)


def walk_frames(source, base, row):
    # Every pose remains one whole drawing, including the head/neck/torso join.
    tiles = []
    for step in range(4):
        tile = source.crop((step * source.width // 4, row * source.height // 3,
                            (step + 1) * source.width // 4, (row + 1) * source.height // 3))
        tile = remove_strays(tile)
        tiles.append(tile.crop(tile.getbbox()))
    # One scale per direction: bending a knee must not resize the head and body.
    scale = min(62 / max(tile.height for tile in tiles), 60 / max(tile.width for tile in tiles))
    rgb_base = Image.new('RGB', SIZE, (241, 0, 238))
    rgb_base.paste(base, mask=base.getchannel('A'))
    palette = rgb_base.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    result = []
    for tile in tiles:
        width, height = round(tile.width * scale), round(tile.height * scale)
        tile = tile.resize((width, height), Image.Resampling.NEAREST)
        # Anchor the waist, not a pasted face: head and shoulders can sway together.
        alpha = tile.getchannel('A')
        columns = [x for y in range(round(height * .70), round(height * .85))
                   for x in range(width) if alpha.getpixel((x, y))]
        columns.sort()
        hip_x = columns[len(columns) // 2]
        frame = blank()
        frame.paste(tile, (32 - hip_x, 71 - height))
        color = frame.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
        color.putalpha(frame.getchannel('A'))
        color.paste((0, 0, 0, 0), (0, 71, 64, 72))
        result.append(clean(color))
    return result


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
            bases = [touch_up_face(base, avatar_id, view) for base, view in zip(bases, VIEWS)]
        sheet = Image.new('RGBA', (320, 216))
        walking = []
        drawn = Image.open(HERE / f'walk-{avatar_id}-source.png').convert('RGBA')
        for row, (direction, base) in enumerate(zip(VIEWS, bases)):
            base.save(OUT / f'{avatar_id}-{direction}.png')
            sheet.paste(base, (0, row * 72))
            poses = walk_frames(drawn, base, row)
            assert len({pose.tobytes() for pose in poses}) == 4, (avatar_id, direction)
            for step, pose in enumerate(poses):
                pose.save(OUT / f'{avatar_id}-{direction}-{step + 1:02}.png', optimize=True)
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
