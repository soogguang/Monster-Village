import Phaser from 'phaser';
import { parseCatalog, type CatalogEntry } from './rules/catalog';
import { VillageScene } from './scenes/VillageScene';
import { GameStore, LocalStorage } from './store';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import galmuri14 from 'galmuri/dist/Galmuri14.woff2?url';
import { mountHud } from './ui/hud';
import './ui/pixel.css';

const CHARACTER_DIR = 'assets/characters/';

const store = new GameStore(new LocalStorage());
store.setCatalog(await loadCatalog());
await loadPixelFonts();
mountHud(store, CHARACTER_DIR);

/** 한글 도트 폰트(갈무리, OFL 라이선스)를 불러와요. 실패해도 기본 글꼴로 계속 돌아가요. */
async function loadPixelFonts(): Promise<void> {
  const fonts = [new FontFace('Galmuri11', `url(${galmuri11})`), new FontFace('Galmuri14', `url(${galmuri14})`)];
  await Promise.all(fonts.map((f) => f.load().then((loaded) => document.fonts.add(loaded)).catch(() => undefined)));
}

/** 캐릭터 목록을 불러와요. 아직 파일이 없거나 형식이 틀려도 게임은 임시 그림으로 계속 돌아가요. */
async function loadCatalog(): Promise<CatalogEntry[]> {
  try {
    const res = await fetch(`${CHARACTER_DIR}catalog.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const { entries, problems } = parseCatalog(await res.json());
    for (const p of problems) console.warn(`[catalog.json] ${p}`);
    return entries;
  } catch {
    return [];
  }
}

// 캔버스는 창 크기 그대로 쓰고, 픽셀 배율은 카메라 줌으로 고정해요.
// (창에 맞춰 화면 전체를 늘리면 픽셀이 지나치게 커져요.)
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#1d1b2a',
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [new VillageScene(store, CHARACTER_DIR)],
});
