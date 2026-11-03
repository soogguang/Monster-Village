import Phaser from 'phaser';
import { parseCatalog, type CatalogEntry } from './rules/catalog';
import { VillageScene } from './scenes/VillageScene';
import { GameStore, LocalStorage } from './store';
import { mountTaskPanel } from './ui/taskPanel';

const CHARACTER_DIR = 'assets/characters/';

const store = new GameStore(new LocalStorage());
store.setCatalog(await loadCatalog());
mountTaskPanel(document.getElementById('panel')!, store);

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
