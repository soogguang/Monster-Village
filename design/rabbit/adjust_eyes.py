"""Give cat, rabbit and puppy the same slightly tall oval eyes at 64×72.

The hedgehog reference has solid brown pupils and one upper-left white glint.
Requires Pillow. Only registered eye windows are repainted; this is idempotent.
The historical rabbit script path is kept so previous export commands work.
"""
import base64
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CHARACTERS = ROOT / 'public/assets/characters'
EXPORT = Path('/workspace/exports/resident-eye-style')
INK = (77, 48, 31, 255)
LIGHT = (253, 246, 227, 255)
# The same 5×6 silhouette and one-pixel glint are used for every open eye.
PATTERN = (' ### ', '#W###', '#####', '#####', '#####', ' ### ')
# Face-color sample, then (old eye cleanup window, new oval top-left) per eye.
GUIDES = {
    'sprout-cat': ((27, 27), [((17, 24, 23, 31), (18, 25)), ((32, 24, 39, 31), (34, 25))]),
    'sprout-cat-dandelion': ((30, 29), [((19, 26, 26, 33), (21, 27)), ((34, 26, 40, 33), (35, 27))]),
    'sprout-rabbit': ((31, 36), [((24, 34, 29, 39), (24, 34)), ((35, 34, 40, 39), (35, 34))]),
    'sprout-rabbit-jump': ((29, 40), [((21, 38, 26, 43), (21, 38)), ((32, 38, 37, 43), (32, 38))]),
    'sprout-puppy': ((30, 26), [((20, 24, 26, 31), (21, 25)), ((34, 24, 40, 31), (35, 25))]),
    'sprout-puppy-dig': ((28, 38), [((19, 39, 25, 45), (20, 39)), ((29, 37, 35, 43), (30, 37))]),
}


def main():
    EXPORT.mkdir(parents=True, exist_ok=True)
    for name, (sample, eyes) in GUIDES.items():
        path = CHARACTERS / f'{name}.png'
        image = Image.open(path).convert('RGBA')
        face = image.getpixel(sample)
        assert face[3] == 255
        for cleanup, (left, top) in eyes:
            # Remove the old pupil/rim, including its former round corners.
            ImageDraw.Draw(image).rectangle(cleanup, fill=face)
            for y, row in enumerate(PATTERN):
                for x, mark in enumerate(row):
                    image.putpixel((left + x, top + y), LIGHT if mark == 'W' else INK if mark == '#' else face)
        image.save(path, optimize=True)

    preview_html()


def preview_html():
    def data(image):
        from io import BytesIO
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()

    font = base64.b64encode((ROOT / 'node_modules/galmuri/dist/Galmuri11.woff2').read_bytes()).decode()
    cards = []
    for label, name, action_label, action in (
        ('고양이', 'sprout-cat', '민들레 모습', 'sprout-cat-dandelion'),
        ('토끼', 'sprout-rabbit', '점프', 'sprout-rabbit-jump'),
        ('강아지', 'sprout-puppy', '땅파기', 'sprout-puppy-dig'),
    ):
        image = Image.open(CHARACTERS / f'{name}.png')
        action_image = Image.open(CHARACTERS / f'{action}.png')
        left, top = GUIDES[name][1][0][1]
        eye = image.crop((left, top, left + 5, top + 6))
        cards.append(f'''<article><h2>{label}</h2><img class="large" src="{data(image)}">
          <div class="details"><div><span>실제 크기</span><img class="native" src="{data(image)}"></div>
          <div><span>같은 눈 모양</span><img class="eye" src="{data(eye)}"></div></div>
          <h3>{action_label}</h3><img class="large" src="{data(action_image)}"></article>''')
    html = f'''<!doctype html><meta charset="utf-8"><style>
      @font-face{{font-family:pixel;src:url(data:font/woff2;base64,{font})}}
      *{{box-sizing:border-box}}body{{margin:0;background:#e8dcc1;color:#4c3224;font-family:pixel,sans-serif}}
      main{{width:1040px;padding:24px}}h1{{font-size:25px;margin:0 0 12px}}header p{{font-size:14px;margin:0 0 22px}}
      section{{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}}
      article{{padding:16px;background:#fff4da;border:2px solid #bfa077;text-align:center}}
      h2{{font-size:20px;margin:0 0 8px}}h3{{font-size:14px;font-weight:normal;margin:18px 0 0;color:#7d6752}}
      img{{image-rendering:pixelated;display:block;margin:auto}}.large{{width:256px;height:288px}}
      .details{{display:flex;justify-content:center;gap:36px;padding:12px 0;border-block:1px solid #dbc6a2}}
      .details span{{display:block;font-size:12px;color:#7d6752;margin-bottom:8px}}.native{{width:64px;height:72px}}.eye{{width:60px;height:72px}}
      footer{{font-size:12px;color:#7d6752;margin-top:18px}}
      </style><main><header><h1>고양이 · 토끼 · 강아지 눈 통일</h1>
      <p>같은 5×6픽셀 타원형 · 왼쪽 위 흰 점 1개 · 실제 게임 PNG를 4배 확대</p></header>
      <section>{''.join(cards)}</section><footer>정면과 눈 뜬 행동 그림에 같은 눈을 적용했어요.</footer></main>'''
    (EXPORT / 'preview.html').write_text(html)


if __name__ == '__main__':
    main()
