"""Build review drafts in the game's 64×72 grid. Requires Pillow.

Sources were designed with 64-pixel silhouettes and limited pixel clusters.
No resident catalog or application files are changed by this exporter.
"""
import base64
import json
import zipfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / 'png'
EXPORT = Path('/workspace/exports/resident-concepts')
SPECS = [
    ('star-hedgehog', '별가시 고슴도치', '희귀 새싹', '반짝이는 조각', '등에 피어난 별꽃'),
    ('blanket-turtle', '이불등 거북', '꾸벅이', '따뜻한 곳과 작은 이불', '포근한 이불 등껍질'),
    ('teacup-otter', '찻잔 수달', '꾸벅이', '품에 안은 따뜻한 찻잔', '큰 찻잔에서 동동'),
    ('doodle-raccoon', '낙서 너구리', '말썽', '모으는 색연필', '알록달록 붓 꼬리'),
]


def hard_alpha(image):
    image = image.convert('RGBA')
    image.putalpha(image.getchannel('A').point(lambda a: 255 if a >= 240 else 0))
    return image


def clear_tiny_components(image):
    image = hard_alpha(image)
    alpha = image.getchannel('A')
    points = {(x, y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x, y))}
    components = []
    while points:
        seed = points.pop()
        component, stack = {seed}, [seed]
        while stack:
            x, y = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    point = (x + dx, y + dy)
                    if point in points:
                        points.remove(point)
                        component.add(point)
                        stack.append(point)
        components.append(component)
    minimum = max(20, max(map(len, components)) // 2000)
    mask = Image.new('L', image.size)
    for component in components:
        if len(component) >= minimum:
            for point in component:
                mask.putpixel(point, 255)
    image.putalpha(mask)
    return image.crop(mask.getbbox())


def export_pair(spec):
    resident_id = spec[0]
    source = Image.open(HERE / 'sources' / f'{resident_id}.png').convert('RGBA')
    crops = [clear_tiny_components(source.crop((i * source.width // 2, 0, (i + 1) * source.width // 2, source.height))) for i in range(2)]
    # One common scale preserves the individual's head size across both states.
    scale = min(54 / crops[0].width, 54 / crops[0].height,
                60 / crops[1].width, 62 / crops[1].height)
    frames = []
    for crop in crops:
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        crop = crop.resize(size, Image.Resampling.NEAREST)
        frame = Image.new('RGBA', (64, 72))
        frame.paste(crop, ((64 - crop.width) // 2, 71 - crop.height))
        frames.append(hard_alpha(frame))
    swatch = Image.new('RGBA', (128, 72), (241, 0, 238, 255))
    for i, frame in enumerate(frames):
        swatch.alpha_composite(frame, (64 * i, 0))
    palette = swatch.convert('RGB').quantize(colors=24, method=Image.Quantize.MEDIANCUT)
    for state, frame in zip(('base', 'special'), frames):
        rgb = Image.new('RGB', frame.size, (241, 0, 238))
        rgb.paste(frame, mask=frame.getchannel('A'))
        result = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
        result.putalpha(frame.getchannel('A'))
        for y in range(72):
            for x in range(64):
                if result.getpixel((x, y))[3] == 0:
                    result.putpixel((x, y), (0, 0, 0, 0))
        assert result.getchannel('A').crop((0, 71, 64, 72)).getextrema() == (0, 0)
        result.save(OUT / f'{resident_id}-{state}.png', optimize=True)


def preview_html():
    font = base64.b64encode((ROOT / 'node_modules/galmuri/dist/Galmuri11.woff2').read_bytes()).decode()
    cards = []
    def src(resident_id, state):
        data = base64.b64encode((OUT / f'{resident_id}-{state}.png').read_bytes()).decode()
        return 'data:image/png;base64,' + data
    for resident_id, name, kind, base, special in SPECS:
        cards.append(f'''<article><h2>{name}<small>{kind}</small></h2>
          <div class="pair"><div><label>기본 모습</label><img src="{src(resident_id, 'base')}"><p>{base}</p></div>
          <div><label>특별한 모습</label><img src="{src(resident_id, 'special')}"><p>{special}</p></div></div>
          <div class="native"><span>실제 크기</span><img src="{src(resident_id, 'base')}"><img src="{src(resident_id, 'special')}"></div></article>''')
    html = f'''<!doctype html><meta charset="utf-8"><style>
      @font-face{{font-family:pixel;src:url(data:font/woff2;base64,{font})}}
      *{{box-sizing:border-box}}body{{margin:0;background:#e6d7b9;color:#4c3224;font-family:pixel,sans-serif}}
      main{{width:1200px;padding:24px}}h1{{font-size:26px;margin:0 0 10px}}header p{{margin:0 0 20px;font-size:14px}}
      section{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}article{{padding:14px;background:#fff4d9;border:3px solid #bfa077}}
      h2{{font-size:20px;margin:0 0 16px;display:flex;justify-content:space-between}}small{{font-size:13px;color:#87705a}}
      .pair{{display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center}}label{{display:block;font-size:13px;color:#87705a}}
      .pair img{{width:256px;height:288px;image-rendering:pixelated;display:block;margin:auto}}.pair p{{margin:4px 0 8px;font-size:12px}}
      .native{{display:flex;align-items:center;justify-content:center;gap:16px;border-top:1px solid #d8c29c;padding-top:8px;margin-top:8px}}
      .native span{{font-size:12px;color:#87705a}}.native img{{width:64px;height:72px;image-rendering:pixelated}}
      footer{{font-size:12px;margin-top:18px;color:#87705a}}
      </style><main><header><h1>새 주민 초안</h1><p>64×72 투명 PNG · 확대는 4배 정수 배율 · 기본 모습 / 특별한 모습</p></header>
      <section>{''.join(cards)}</section><footer>검토용 초안입니다. 주민 도감과 만나는 조건에는 아직 등록하지 않았습니다.</footer></main>'''
    (EXPORT / 'preview.html').write_text(html)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    EXPORT.mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        export_pair(spec)
    preview_html()
    (HERE / 'drafts.json').write_text(json.dumps({
        'status': 'draft-not-registered', 'frame': [64, 72],
        'residents': [{'id': spec[0], 'name': spec[1], 'proposedKind': spec[2],
                       'base': f'png/{spec[0]}-base.png', 'special': f'png/{spec[0]}-special.png'} for spec in SPECS]
    }, ensure_ascii=False, indent=2) + '\n')
    with zipfile.ZipFile(EXPORT / 'resident-native-64x72.zip', 'w', zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(OUT.glob('*.png')):
            bundle.write(path, path.name)
    print('Exported 8 draft PNGs at 64×72, with binary transparency and shared per-pair palettes.')


if __name__ == '__main__':
    main()
